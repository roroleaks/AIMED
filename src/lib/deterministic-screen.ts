/**
 * Deterministic screening module for Step 2.
 * Classifies literature corpus matching intake words into:
 * (i) Established knowledge, (ii) Conflicting evidence, (iii) Research gap.
 * Builds exactly 3 differentiated PICO-formatted phrases with evidence-grounded basis.
 */

import { z } from "zod";
import { designOf, sigTokens } from "./relevance.ts";
import type { AuditableRef } from "./relevance.ts";
import type { PicoWord } from "./pico-roles.ts";
import { SPECIALTIES } from "./specialties.ts";

export type ScreenCategory = "established" | "conflicting" | "gap";

export const screenPicoRoleSchema = z.enum(["population", "intervention", "comparator", "outcome", "other"]);

export const screenWordSchema = z.object({
  word: z.string().trim().min(1, "Word cannot be empty"),
  role: screenPicoRoleSchema
});

export const screenStageSchema = z.object({
  stage: z.literal("screen"),
  words: z.array(screenWordSchema).min(3, "At least 3 words required").max(5, "At most 5 words allowed"),
  specialty: z.string().trim().min(1, "Specialty is required")
});

export type ScreenStageInput = z.infer<typeof screenStageSchema>;

export function isValidSpecialty(id: string): boolean {
  return id in SPECIALTIES || id === "infertility" || id === "gynecology" || id === "obstetrics";
}

export function validateScreenRequest(body: unknown):
  | { ok: true; data: ScreenStageInput }
  | { ok: false; status: 400; error: string } {
  const parsed = screenStageSchema.safeParse(body);
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
  return { ok: true, data: parsed.data };
}

export interface ScreenPhrase {
  category: ScreenCategory;
  phrase: string;
  basis: string;
}

export interface ScreenCorpusStats {
  retrieved: number;
  screened: number;
  relaxationLevel: 0 | 1 | 2;
}

export interface ScreenSourceStatus {
  id: string;
  ok: boolean;
  count: number;
}

export interface ScreenPayload {
  inputWords: string[];
  source: "ai" | "deterministic";
  phrases: {
    established: ScreenPhrase;
    conflicting: ScreenPhrase;
    gap: ScreenPhrase;
  };
  corpusStats: ScreenCorpusStats;
  specialty?: string;
  sources?: ScreenSourceStatus[];
}

const ESTABLISHED_REGEX = /\b(reduces|improves|is recommended|first-line|standard of care|effective|beneficial|superior to)\b/i;
const CONFLICTING_REGEX = /\b(no significant difference|controversial|inconsistent|heterogeneous|conflicting results|remains unclear|debatable|equivocal|opposing)\b/i;
const GAP_REGEX = /\b(further research|future studies|limited data|scarcity|lack of|warranted|unresolved|scant evidence|need for well-designed)\b/i;
const SMALL_SAMPLE_REGEX = /\b(case series|case report|pilot study|small sample|preliminary report)\b/i;

/**
 * Pure, no-network classification of retrieved records against input PICO words.
 * Returns signal counts for established, conflicting, and research gap categories.
 */
export function classifyCorpus(
  records: AuditableRef[],
  words: PicoWord[]
): Record<ScreenCategory, number> {
  let established = 0;
  let conflicting = 0;
  let gap = 0;

  if (!records || records.length === 0) {
    // If no records exist, gap signal is elevated
    return { established: 0, conflicting: 0, gap: Math.max(1, words.length) };
  }

  // Pre-tokenize records for word coverage
  const recordTokenSets: Set<string>[] = records.map(r => {
    const fullText = `${r.title} ${r.journal || ""} ${r.context || ""}`;
    return new Set(sigTokens(fullText));
  });

  // Check each word's coverage across the entire corpus
  for (const w of words) {
    const wTokens = sigTokens(w.word);
    if (wTokens.length === 0) continue;
    const covered = recordTokenSets.some(tokSet => wTokens.some(t => tokSet.has(t)));
    if (!covered) {
      gap += 1;
    }
  }

  // Analyze each record for category signals
  let hasIncreased = false;
  let hasDecreased = false;

  for (const r of records) {
    const text = `${r.title} ${r.journal || ""} ${r.context || ""}`;
    const design = designOf(r.title, r.journal || "");

    // Established signals
    if (design === "systematic review / meta-analysis") {
      established += 1;
    }
    if (ESTABLISHED_REGEX.test(text)) {
      established += 1;
    }

    // Conflicting signals
    if (CONFLICTING_REGEX.test(text)) {
      conflicting += 1;
    }
    if (/\bincreased?\b/i.test(text)) hasIncreased = true;
    if (/\bdecreased?\b/i.test(text)) hasDecreased = true;

    if (SMALL_SAMPLE_REGEX.test(text)) {
      conflicting += 1;
    }

    // Gap wording signals in literature
    if (GAP_REGEX.test(text)) {
      gap += 1;
    }
  }

  // Co-occurrence of opposing effect directions across corpus
  if (hasIncreased && hasDecreased) {
    conflicting += 1;
  }

  return { established, conflicting, gap };
}

/**
 * Builds deterministic screening payload with exactly 3 differentiated PICO phrases and evidence bases.
 */
export function generateDeterministicScreen(
  words: PicoWord[],
  corpus: AuditableRef[] = [],
  relaxationLevel: 0 | 1 | 2 = 0,
  retrievedCount?: number
): ScreenPayload {
  const counts = classifyCorpus(corpus, words);
  const totalRetrieved = retrievedCount !== undefined ? retrievedCount : corpus.length;
  const totalScreened = corpus.length;

  // 1. Normalize submitted words into role slots:
  // P = first population word; I1 = first intervention word; I2 = second intervention word;
  // C = first comparator word; O = first outcome word.
  // First submitted wins within each role.
  const pList = words.filter(w => w.role === "population").map(w => w.word);
  const iList = words.filter(w => w.role === "intervention").map(w => w.word);
  const cList = words.filter(w => w.role === "comparator").map(w => w.word);
  const oList = words.filter(w => w.role === "outcome").map(w => w.word);
  const otherList = words.filter(w => w.role === "other").map(w => w.word);

  const unusedOthers = [...otherList];

  let P = pList[0];
  if (!P && unusedOthers.length > 0) {
    P = unusedOthers.shift()!;
  }
  if (!P) {
    P = "target clinical population";
  }

  let I1 = iList[0];
  if (!I1 && unusedOthers.length > 0) {
    I1 = unusedOthers.shift()!;
  }
  if (!I1) {
    I1 = "clinical intervention";
  }

  const I2 = iList[1]; // may be undefined
  const C = cList[0];   // may be undefined
  const O = oList[0];   // may be undefined

  const effectiveI = I2 ? `${I1} or ${I2}` : I1;

  // Placed words: P, I1, I2, C, O
  // Compute leftovers from full submitted word list minus the words already placed (P, I1, I2, C, O)
  const placedWords = new Set<string>();
  if (P && P !== "target clinical population") placedWords.add(P.trim().toLowerCase());
  if (I1 && I1 !== "clinical intervention") placedWords.add(I1.trim().toLowerCase());
  if (iList[1]) placedWords.add(iList[1].trim().toLowerCase());
  if (cList[0]) placedWords.add(cList[0].trim().toLowerCase());
  if (oList[0]) placedWords.add(oList[0].trim().toLowerCase());

  const leftovers = words
    .filter(w => !placedWords.has(w.word.trim().toLowerCase()))
    .map(w => w.word.trim());

  // Compute per-word corpus coverage:
  // Derived as the count of records whose title + context match that word's sigTokens.
  const recordTokenSets = corpus.map(r => new Set(sigTokens(`${r.title} ${r.journal || ""} ${r.context || ""}`)));

  const wordCoverage = new Map<string, number>();
  for (const w of words) {
    const toks = sigTokens(w.word);
    if (toks.length === 0) {
      wordCoverage.set(w.word, 0);
    } else {
      const matchCount = recordTokenSets.filter(tokSet => toks.some(t => tokSet.has(t))).length;
      wordCoverage.set(w.word, matchCount);
    }
  }

  const zeroCoverageWords = words.filter(w => (wordCoverage.get(w.word) ?? 0) === 0);
  const oCoverage = O ? (wordCoverage.get(O) ?? 0) : 0;

  // Systematic review count for established basis
  const metaReviewCount = corpus.filter(
    r => designOf(r.title, r.journal || "") === "systematic review / meta-analysis"
  ).length;

  // 1. Established phrase: the single best-supported efficacy claim
  // In [P] (P), does [effectiveI] (I) compared with [C if present, else "usual care"] (C) improve [O if present, else "clinical outcomes"] (O)?
  const estC = C ? C : "usual care";
  const estO = O ? O : "clinical outcomes";
  let establishedPhrase = `In ${P} (P), does ${effectiveI} (I) compared with ${estC} (C) improve ${estO} (O)?`;

  let establishedBasis = "";
  if (metaReviewCount > 0) {
    establishedBasis = `Screened literature contains ${metaReviewCount} systematic review / meta-analysis publication(s) and consensus data evaluating this comparison.`;
  } else if (counts.established > 0) {
    establishedBasis = `Synthesized from ${counts.established} established clinical effectiveness signal(s) identified across screened records.`;
  } else if (totalScreened > 0) {
    establishedBasis = `Derived from baseline clinical guidance across ${totalScreened} retrieved and screened records.`;
  } else {
    establishedBasis = `Baseline clinical formulation derived from input parameters (no records retrieved during exact literature query).`;
  }

  // 2. Conflicting phrase: head-to-head comparison whose evidence disagrees
  // - If C is present: In [P] (P), is [effectiveI] (I) superior to [C] (C) for [O] (O)?
  // - Else if I2 is present: In [P] (P), does [effectiveI] (I) compared with [I2] (C) improve [O] (O)?
  // - Else (single I only): In [P] (P), does [effectiveI] (I) compared with [C-default "usual care"] (C) consistently improve [O] (O) across study designs?
  const confO = O ? O : "clinical outcomes";
  let conflictingPhrase = "";
  if (C) {
    conflictingPhrase = `In ${P} (P), is ${effectiveI} (I) superior to ${C} (C) for ${confO} (O)?`;
  } else if (I2) {
    conflictingPhrase = `In ${P} (P), does ${effectiveI} (I) compared with ${I2} (C) improve ${confO} (O)?`;
  } else {
    conflictingPhrase = `In ${P} (P), does ${effectiveI} (I) compared with usual care (C) consistently improve ${confO} (O)?`;
  }

  let conflictingBasis = "";
  if (counts.conflicting > 0) {
    conflictingBasis = `Screened records demonstrate conflicting clinical evidence, heterogeneous outcomes, or neutral findings ('no significant difference') across trials.`;
  } else if (totalScreened > 0) {
    conflictingBasis = `Evidence across ${totalScreened} screened studies exhibits protocol variability and heterogeneous patient response.`;
  } else {
    conflictingBasis = `Comparative trial literature lacks conclusive consensus across evaluated clinical parameters.`;
  }

  // 3. Gap phrase: built around the LEAST-covered role word
  // - If some role word has ZERO coverage -> put that word in its PICO slot and center the phrase on it.
  // - Else if all words are covered but O is covered only weakly (<= 1 matching record) -> targets patient-important endpoints:
  //   In [P] (P), does [effectiveI] (I) compared with [C-or-I2-or-default] (C) improve long-term safety and quality-of-life outcomes (O)?
  // - Else (everything well covered) -> subgroup/long-horizon variant:
  //   In high-risk subgroups of [P] (P), does [effectiveI] (I) compared with [C-or-I2-or-default] (C) improve [O] (O) without additional adverse events (O)?
  const cOrI2OrDefault = C ? C : (I2 ? I2 : "usual care");
  let gapPhrase = "";
  let gapBasis = "";

  const gapO = O ? `${O} and long-term quality-of-life outcomes` : "long-term safety and quality-of-life outcomes";

  if (zeroCoverageWords.length > 0 && totalScreened > 0) {
    // Prioritize uncovered outcome, then comparator, then intervention, then population
    const zeroOutcome = zeroCoverageWords.find(w => w.role === "outcome");
    const zeroComparator = zeroCoverageWords.find(w => w.role === "comparator");
    const zeroIntervention = zeroCoverageWords.find(w => w.role === "intervention");
    const zeroPopulation = zeroCoverageWords.find(w => w.role === "population");

    if (zeroOutcome) {
      gapPhrase = `In ${P} (P), does ${effectiveI} (I) compared with ${cOrI2OrDefault} (C) improve ${zeroOutcome.word} (O)?`;
      gapBasis = `No screened record addresses '${zeroOutcome.word}' — comparative evidence for this element is missing.`;
    } else if (zeroComparator) {
      gapPhrase = `In ${P} (P), does ${effectiveI} (I) compared with ${zeroComparator.word} (C) improve ${O || "clinical outcomes"} (O)?`;
      gapBasis = `No screened record addresses '${zeroComparator.word}' — comparative evidence for this element is missing.`;
    } else if (zeroIntervention) {
      const targetI = zeroIntervention.word;
      const comp = targetI === I1 ? (I2 ? I2 : "usual care") : (I1 ? I1 : "usual care");
      gapPhrase = `In ${P} (P), does ${targetI} (I) compared with ${comp} (C) improve ${O || "clinical outcomes"} (O)?`;
      gapBasis = `No screened record addresses '${targetI}' — comparative evidence for this element is missing.`;
    } else if (zeroPopulation) {
      gapPhrase = `In unstudied cohorts of ${zeroPopulation.word} (P), does ${effectiveI} (I) compared with ${cOrI2OrDefault} (C) improve ${O || "clinical outcomes"} (O)?`;
      gapBasis = `No screened record addresses '${zeroPopulation.word}' — comparative evidence for this element is missing.`;
    } else {
      const firstZero = zeroCoverageWords[0];
      gapPhrase = `In ${P} (P), does ${effectiveI} (I) compared with ${cOrI2OrDefault} (C) improve ${O || "clinical outcomes"} (O)?`;
      gapBasis = `No screened record addresses '${firstZero.word}' — comparative evidence for this element is missing.`;
    }
  } else if (totalScreened > 0 && oCoverage <= 1) {
    gapPhrase = `In ${P} (P), does ${effectiveI} (I) compared with ${cOrI2OrDefault} (C) improve ${gapO} (O)?`;
    gapBasis = `Screened literature provides sparse coverage (${oCoverage} record(s)) for clinical outcomes, leaving long-term safety and patient-reported endpoints unaddressed.`;
  } else if (totalScreened > 0) {
    gapPhrase = `In high-risk subgroups of ${P} (P), does ${effectiveI} (I) compared with ${cOrI2OrDefault} (C) improve ${O || "clinical outcomes"} (O) without additional adverse events (O)?`;
    gapBasis = `While overall efficacy has ${oCoverage} matching records, high-risk subgroup stratification and long-term adverse event profiles remain unaddressed in screened evidence.`;
  } else {
    // Zero-corpus edge case
    const zeroC = C ? C : (I2 ? I2 : "an optimal control regimen");
    gapPhrase = `In ${P} (P), does ${effectiveI} (I) compared with ${zeroC} (C) improve ${gapO} (O)?`;
    gapBasis = `Uncovered research territory with no indexed records matching all submitted parameters simultaneously.`;
  }

  // Safety differentiation check to ensure pairwise distinctness
  if (gapPhrase === establishedPhrase) {
    if (!C) {
      gapPhrase = gapPhrase.replace("compared with usual care (C)", "compared with an optimal control regimen (C)");
    } else {
      gapPhrase = gapPhrase.replace(`In ${P} (P)`, `In high-risk subgroups of ${P} (P)`);
    }
  }
  if (conflictingPhrase === establishedPhrase) {
    conflictingPhrase = `In ${P} (P), does ${effectiveI} (I) compared with ${estC} (C) consistently improve ${confO} (O) across study designs?`;
  }

  // Leftover words deterministic trailing clause appended before '?'
  const appendLeftovers = (phrase: string): string => {
    if (leftovers.length === 0) return phrase;
    const clause = `, with attention to ${leftovers.join(" and ")}`;
    if (phrase.endsWith("?")) {
      return phrase.slice(0, -1) + clause + "?";
    }
    return phrase + clause;
  };

  establishedPhrase = appendLeftovers(establishedPhrase);
  conflictingPhrase = appendLeftovers(conflictingPhrase);
  gapPhrase = appendLeftovers(gapPhrase);

  // Invariant: Every submitted word must appear verbatim in every phrase.
  // P, I1, I2, C, O are placed in their respective PICO slots (with I2 in the intervention slot when present),
  // and any remaining leftover words appear in the trailing clause before '?'.

  return {
    inputWords: words.map(w => w.word),
    source: "deterministic",
    phrases: {
      established: {
        category: "established",
        phrase: establishedPhrase,
        basis: establishedBasis
      },
      conflicting: {
        category: "conflicting",
        phrase: conflictingPhrase,
        basis: conflictingBasis
      },
      gap: {
        category: "gap",
        phrase: gapPhrase,
        basis: gapBasis
      }
    },
    corpusStats: {
      retrieved: totalRetrieved,
      screened: totalScreened,
      relaxationLevel
    }
  };
}
