/**
 * Deterministic scoring module for AIMed v4 Step 3 (Evidence Explorer).
 * Computes per-record percentage relevance to a selected PICO phrase,
 * applies category-specific evidence bonuses (capped at +10),
 * filters blocked/seen records, and sorts deterministically.
 * Pure, synchronous, zero AI/network calls.
 */

import { z } from "zod";
import { auditRef, isNonEvidenceItem } from "./relevance.ts";
import type { AuditableRef, PicoElement } from "./relevance.ts";
import { extractPicoFromQuestion } from "./pico-parser.ts";
import { screenWordSchema, isValidSpecialty } from "./deterministic-screen.ts";
import { classifyPaperType } from "./study-design.ts";

const GENERIC_COMPARATOR_RE = /^(?:placebo|sham|control|controls|standard care|usual care|routine care|standard of care|no treatment|observation|conventional treatment|\[comparator not specified\])$/i;

export interface ExploreRecord extends AuditableRef {
  relevancePct: number;
  matchedElements: string[];
  design?: string;
  lowMetadata?: boolean;
}

export interface ScoreRecordsResult {
  scored: ExploreRecord[];
  removedByBlock: number;
}

export const exploreChoiceSchema = z.object({
  category: z.enum(["established", "conflicting", "gap"]),
  phrase: z.string().trim().min(1, "Phrase is required")
});

export const exploreStageSchema = z.object({
  stage: z.literal("explore"),
  choice: exploreChoiceSchema,
  words: z.array(screenWordSchema).min(3, "At least 3 words required").max(5, "At most 5 words allowed"),
  specialty: z.string().trim().min(1, "Specialty is required"),
  sources: z.array(z.string()).min(1, "Sources list cannot be empty").optional(),
  excluded: z.object({
    userExcluded: z.array(z.string()).optional(),
    seen: z.array(z.string()).optional()
  }).optional()
});

export type ExploreStageInput = z.infer<typeof exploreStageSchema>;

export function validateExploreRequest(body: unknown):
  | { ok: true; data: ExploreStageInput }
  | { ok: false; status: 400; error: string } {
  const parsed = exploreStageSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Invalid parameters: " + parsed.error.issues.map(e => e.message).join(", ")
    };
  }
  if (!isValidSpecialty(parsed.data.specialty)) {
    return {
      ok: false,
      status: 400,
      error: "Unknown specialty: " + parsed.data.specialty
    };
  }
  // Validate that the phrase covers all submitted words
  const phraseLower = parsed.data.choice.phrase.toLowerCase();
  for (const w of parsed.data.words) {
    const wordLower = w.word.trim().toLowerCase();
    if (!phraseLower.includes(wordLower)) {
      return {
        ok: false,
        status: 400,
        error: `Phrase does not contain submitted word: "${w.word}"`
      };
    }
  }

  return { ok: true, data: parsed.data };
}

export function filterExcludedRecords(
  records: ExploreRecord[],
  userExcluded: string[] = [],
  seen: string[] = []
): { surviving: ExploreRecord[]; blockedCount: number } {
  const blockedSet = new Set<string>();
  for (const item of [...userExcluded, ...seen]) {
    const raw = item.trim();
    if (!raw) continue;
    blockedSet.add(raw);
    blockedSet.add(raw.toLowerCase());
    const norm = normalizeTitle(raw);
    if (norm) {
      blockedSet.add(norm);
      blockedSet.add("norm:" + norm);
    }
  }

  const surviving: ExploreRecord[] = [];
  let blockedCount = 0;

  for (const r of records) {
    const keys = refCanonicalKeys(r);
    const normT = normalizeTitle(r.title || "");
    const isBlocked = keys.some(k => blockedSet.has(k)) || (normT.length > 5 && blockedSet.has(normT));
    if (isBlocked) {
      blockedCount++;
    } else {
      surviving.push(r);
    }
  }

  return { surviving, blockedCount };
}

const ESTABLISHED_BONUS_WORDS = /\b(reduces|improves|first-line|recommended|superior|effective)\b/i;
const CONFLICTING_BONUS_WORDS = /\b(no significant difference|heterogeneous|inconsistent|controversial|conflicting|equivocal)\b/i;
const CONFLICTING_SMALL_SAMPLE = /\b(case series|case report|pilot study|small sample|preliminary report)\b/i;
const GAP_BONUS_WORDS = /\b(limited data|further research|scarcity|unresolved|need for well-designed|insufficient evidence)\b/i;

/**
 * Normalizes a paper title for canonical comparisons (trim, lowercase, collapse whitespace).
 */
export function normalizeTitle(title: string): string {
  return (title || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Derives canonical identifier keys for an auditable reference.
 * Matches the key structure used across engine retrieval stages.
 */
export function refCanonicalKeys(r: AuditableRef): string[] {
  const keys: string[] = [];
  if (r.pmid) keys.push("p:" + r.pmid.trim());
  if (r.doi) keys.push("d:" + r.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, "").trim());
  const t = (r.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (t.length > 12) keys.push("t:" + t.slice(0, 50));
  const norm = normalizeTitle(r.title || "");
  if (norm.length > 5) keys.push("norm:" + norm);
  return keys;
}

/**
 * Parses a PICO phrase into structured PicoElement list.
 * Falls back to regex segmentation on markers if standard parsing fails.
 */
export function parsePhraseElements(phrase: string): PicoElement[] {
  try {
    const extracted = extractPicoFromQuestion(phrase);
    const elements: PicoElement[] = [];
    if (extracted.condition) elements.push({ label: "P — Population", value: extracted.condition });
    if (extracted.intervention) elements.push({ label: "I — Intervention", value: extracted.intervention });
    if (extracted.comparator) elements.push({ label: "C — Comparator", value: extracted.comparator });
    if (extracted.outcome) elements.push({ label: "O — Outcome", value: extracted.outcome });
    if (elements.length > 0) return elements;
  } catch {}

  // Fallback regex extraction of literal (P), (I), (C), (O) tagged segments
  const fallback: PicoElement[] = [];
  const pMatch = phrase.match(/^(?:In|For|Among)?\s*(.+?)\s*\(P\)/i) || phrase.match(/([^(]+?)\s*\(P\)/i);
  const iMatch = phrase.match(/\(P\)[^]*?\b(?:does|is|do)?\s+(.+?)\s*\(I\)/i) || phrase.match(/([^(]+?)\s*\(I\)/i);
  const cMatch = phrase.match(/\(I\)[^]*?\b(?:compared with|versus|vs\.?|superior to)?\s+(.+?)\s*\(C\)/i) || phrase.match(/([^(]+?)\s*\(C\)/i);
  const oMatch = phrase.match(/\(C\)[^]*?(?:improve|reduce|increase|for|affect)?\s+(.+?)\s*\(O\)/i) || phrase.match(/([^(]+?)\s*\(O\)/i);

  if (pMatch?.[1]?.trim()) fallback.push({ label: "P — Population", value: pMatch[1].trim() });
  if (iMatch?.[1]?.trim()) fallback.push({ label: "I — Intervention", value: iMatch[1].trim() });
  if (cMatch?.[1]?.trim()) fallback.push({ label: "C — Comparator", value: cMatch[1].trim() });
  if (oMatch?.[1]?.trim()) fallback.push({ label: "O — Outcome", value: oMatch[1].trim() });

  return fallback;
}

/**
 * Computes deterministic relevance percentages and filters blocked keys.
 * Category bonuses are additive and strictly capped at +10 total.
 */
export function scoreRecords(
  records: AuditableRef[],
  phrase: string,
  category: "established" | "conflicting" | "gap",
  blockedKeys: string[] = []
): ScoreRecordsResult {
  if (!records || !Array.isArray(records)) {
    return { scored: [], removedByBlock: 0 };
  }

  // Pre-populate blocked set with raw keys and normalized versions
  const blockedSet = new Set<string>();
  for (const k of blockedKeys) {
    const raw = k.trim();
    if (!raw) continue;
    blockedSet.add(raw);
    blockedSet.add(raw.toLowerCase());
    const norm = normalizeTitle(raw);
    if (norm) {
      blockedSet.add(norm);
      blockedSet.add("norm:" + norm);
    }
  }

  const elements = parsePhraseElements(phrase);

  // 1. Filter out blocked records and calculate element coverage counts across surviving records
  const unblocked: AuditableRef[] = [];
  let removedByBlock = 0;

  for (const r of records) {
    const keys = refCanonicalKeys(r);
    const normT = normalizeTitle(r.title || "");
    const isBlocked = keys.some(k => blockedSet.has(k)) || (normT.length > 5 && blockedSet.has(normT));
    if (isBlocked) {
      removedByBlock += 1;
    } else {
      unblocked.push(r);
    }
  }

  // Pre-audit surviving records to determine element coverage for gap category bonus
  const audits = unblocked.map(r => ({
    ref: r,
    audit: elements.length > 0 ? auditRef(r, elements) : null
  }));

  let lowestCoverageElement: "P" | "I" | "C" | "O" | null = null;
  if (category === "gap" && elements.length > 0) {
    const counts = {
      P: audits.filter(a => a.audit?.population).length,
      I: audits.filter(a => a.audit?.intervention).length,
      C: audits.filter(a => a.audit?.comparator).length,
      O: audits.filter(a => a.audit?.outcome).length
    };
    const order: Array<"P" | "I" | "C" | "O"> = ["P", "I", "C", "O"];
    let minVal = Infinity;
    for (const el of order) {
      if (counts[el] < minVal) {
        minVal = counts[el];
        lowestCoverageElement = el;
      }
    }
  }

  // 2. Score each surviving record
  const scored: ExploreRecord[] = [];
  const hasP = elements.some(e => e.label.startsWith("P"));
  const hasI = elements.some(e => e.label.startsWith("I"));
  const hasC = elements.some(e => e.label.startsWith("C"));
  const hasTreatment = hasI || hasC;

  for (const item of audits) {
    const r = item.ref;
    const audit = item.audit;
    const matchedElements: string[] = [];

    if (audit) {
      if (audit.population) matchedElements.push("P");
      if (audit.intervention) matchedElements.push("I");
      if (audit.comparator) matchedElements.push("C");
      if (audit.outcome) matchedElements.push("O");
    }

    const design = classifyPaperType({
      title: r.title,
      journal: r.journal,
      abstract: r.context,
      pubType: r.pubType,
      publicationTypes: r.publicationTypes
    });
    const lowMetadata = !r.title || !r.year;

    // Strict clinical eligibility:
    // Non-evidence items (protocols, registrations, errata, advertisements, editorials) are never eligible findings
    const nonEv = isNonEvidenceItem(r);
    const matchedP = matchedElements.includes("P");
    const matchedI = matchedElements.includes("I");
    const matchedC = matchedElements.includes("C");
    const matchedO = matchedElements.includes("O");

    const compVal = elements.find(e => e.label.startsWith("C"))?.value || "";
    const isCompGeneric = !compVal || GENERIC_COMPARATOR_RE.test(compVal.trim());

    let isEligible = false;
    if (!nonEv.isNonEvidence) {
      if (hasP && hasTreatment) {
        // Core comparative clinical question:
        // Must match Population AND either:
        // 1) The Intervention (I), OR
        // 2) An ACTIVE, SPECIFIC comparator (C) that is not a generic control (placebo/sham/usual care)
        const matchedActiveTreatment = matchedI || (matchedC && !isCompGeneric);
        isEligible = matchedP && matchedActiveTreatment;
      } else if (hasP && !hasTreatment) {
        // Observational / natural history question: must match Population AND Outcome
        isEligible = matchedP && matchedO;
      } else if (!hasP && hasTreatment) {
        // Intervention-defined question: must match Intervention (or specific active comparator) AND Outcome
        const matchedActiveTreatment = matchedI || (matchedC && !isCompGeneric);
        isEligible = matchedActiveTreatment && matchedO;
      } else {
        isEligible = matchedElements.length >= 2;
      }
    }

    // Ineligible records receive relevancePct = 0 and cannot pass through metadata or design bonuses
    if (!isEligible) {
      scored.push({
        ...r,
        relevancePct: 0,
        matchedElements,
        design,
        lowMetadata
      });
      continue;
    }

    // Base score calculation for eligible records (0–75 from matched elements, +15 from metadata completeness/design)
    const elementRatio = elements.length > 0 ? matchedElements.length / elements.length : 0;
    let baseScore = Math.round(elementRatio * 75);

    if (audit?.metadataCompleteness?.hasAbstract || (r.context && r.context.length > 50)) {
      baseScore += 5;
    }
    if (audit?.doiOk || audit?.resolved || r.pmid) {
      baseScore += 5;
    }
    const isSr =
      design === "Systematic Review and Meta-Analysis" ||
      design === "Meta-Analysis" ||
      design === "Systematic Review";

    const isRct =
      design === "Randomized Controlled Trial (RCT)" ||
      design === "Randomized Clinical Trial";

    if (isSr) {
      baseScore += 10;
    } else if (isRct) {
      baseScore += 8;
    } else if (design !== "Observational Study") {
      baseScore += 5;
    }

    // Category bonus calculation (additive, capped at +10)
    let rawCategoryBonus = 0;
    const fullText = `${r.title || ""} ${r.journal || ""} ${r.context || ""}`;

    if (category === "established") {
      // Systematic review / meta-analysis design: +5
      if (isSr) rawCategoryBonus += 5;
      // Consensus wording: +3
      if (ESTABLISHED_BONUS_WORDS.test(fullText)) rawCategoryBonus += 3;
    } else if (category === "conflicting") {
      // Disagreement wording: +5
      if (CONFLICTING_BONUS_WORDS.test(fullText)) rawCategoryBonus += 5;
      // Small sample designs: +2
      if (CONFLICTING_SMALL_SAMPLE.test(fullText) || /case|pilot/i.test(design)) rawCategoryBonus += 2;
    } else if (category === "gap") {
      // Record matches the lowest-coverage element in the corpus: +5
      if (lowestCoverageElement && matchedElements.includes(lowestCoverageElement)) {
        rawCategoryBonus += 5;
      }
      // Research hurdle wording: +3
      if (GAP_BONUS_WORDS.test(fullText)) rawCategoryBonus += 3;
    }

    const categoryBonus = Math.min(10, Math.max(0, rawCategoryBonus));
    const totalScore = Math.max(15, Math.min(100, Math.round(baseScore + categoryBonus)));
    const relevancePct = Number.isFinite(totalScore) ? totalScore : 0;

    scored.push({
      ...r,
      relevancePct,
      matchedElements,
      design,
      lowMetadata
    });
  }

  // 3. Sort deterministically: relevancePct desc -> year desc -> title asc
  scored.sort((a, b) => {
    if (b.relevancePct !== a.relevancePct) {
      return b.relevancePct - a.relevancePct;
    }
    const yearA = parseInt(a.year || "0", 10) || 0;
    const yearB = parseInt(b.year || "0", 10) || 0;
    if (yearB !== yearA) {
      return yearB - yearA;
    }
    return (a.title || "").localeCompare(b.title || "");
  });

  return { scored, removedByBlock };
}
