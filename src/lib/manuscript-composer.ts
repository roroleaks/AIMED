/**
 * Deterministic manuscript composer for publication-grade scientific evidence summaries (Step 4).
 * Pure, verifiable, and grounded exclusively in retained records and session parameters.
 */

import { z } from "zod";
import type { PicoWord } from "./pico-roles.ts";
import type { ExploreRecord } from "./explore-scoring.ts";
import type { CitationStyle } from "./citation-styles.ts";
import {
  formatReferenceInStyle,
  singleRecordInText,
  parseAuthorNames
} from "./citation-styles.ts";
import { isNonEvidenceItem, auditRef, type AuditableRef } from "./relevance.ts";
import { classifyPaperType } from "./study-design.ts";
import { getSpecialtyDefinition } from "./specialties.ts";
import { screenWordSchema, isValidSpecialty } from "./deterministic-screen.ts";
import {
  extractFinding,
  buildTruthfulMethodsText
} from "./deterministic-commentary.ts";
import { outcomeActionVerb } from "./outcome-polarity.ts";
import { assertedDirection } from "./claim-finalization.ts";

export const searchLogEntrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  ok: z.boolean().optional(),
  count: z.number().int().nonnegative().optional(),
  query: z.string().optional(),
  date: z.string().optional(),
  error: z.string().optional()
});

export type SearchLogEntry = z.infer<typeof searchLogEntrySchema>;

export const composeStageSchema = z.object({
  stage: z.literal("compose"),
  words: z.array(screenWordSchema).min(3, "At least 3 words required").max(5, "At most 5 words allowed"),
  specialty: z.string().trim().min(1, "Specialty is required"),
  choice: z.object({
    category: z.enum(["established", "conflicting", "gap"]),
    phrase: z.string().trim().min(1).max(240)
  }),
  screeningStats: z.object({
    retrieved: z.number().int().nonnegative().optional(),
    screened: z.number().int().nonnegative().optional(),
    relaxationLevel: z.number().int().min(0).max(2).optional(),
    excludedCount: z.number().int().nonnegative().optional()
  }).optional(),
  records: z.array(z.object({
    title: z.string().min(1),
    authors: z.string().optional(),
    year: z.string().optional(),
    journal: z.string().optional(),
    doi: z.string().optional(),
    pmid: z.string().optional(),
    relevancePct: z.number().optional(),
    _sig: z.string().optional()
  })).max(50),
  searchLog: z.array(searchLogEntrySchema).optional(),
  sources: z.array(z.string()).min(1, "Sources list cannot be empty").optional(),
  userExcluded: z.array(z.string()).optional(),
  style: z.enum(["vancouver", "apa", "harvard"]).default("vancouver")
});

export type ComposeStageInput = z.infer<typeof composeStageSchema>;

export function validateComposeRequest(body: unknown):
  | { ok: true; data: ComposeStageInput }
  | { ok: false; status: 400; error: string } {
  const parsed = composeStageSchema.safeParse(body);
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

export interface ManuscriptScreeningStats {
  retrieved: number;
  screened: number;
  relaxationLevel: number;
  excludedCount: number;
}

export interface ManuscriptSection {
  heading: string;
  paragraphs: string[];
}

export interface ManuscriptData {
  title: string;
  abstract: string[];
  sections: ManuscriptSection[];
  references: string[];
  citationStyle: CitationStyle;
  aiEnriched?: boolean;
  evidenceConclusion?: string;
}

export interface ComposeManuscriptInput {
  words: PicoWord[];
  category: "established" | "conflicting" | "gap";
  phrase: string;
  screeningStats: ManuscriptScreeningStats;
  records: ExploreRecord[];
  userExcluded?: string[];
  specialty?: string;
  style?: CitationStyle;
  searchLog?: SearchLogEntry[];
}

export const EXPECTED_HEADINGS = [
  "Background",
  "Search strategy and screening",
  "Evidence synthesis",
  "Limitations",
  "Conclusion"
] as const;

/**
 * Format a reference without any URL, link, or http occurrence.
 */
export function formatPlainReference(
  rec: ExploreRecord | AuditableRef,
  style: CitationStyle = "vancouver",
  index?: number
): string {
  const auditable: AuditableRef = {
    pmid: rec.pmid,
    title: rec.title,
    authors: rec.authors,
    year: rec.year,
    journal: rec.journal,
    doi: rec.doi,
    url: ""
  };

  const raw = formatReferenceInStyle(auditable, style, index);
  // Guarantee 0 http occurrences across all citation styles
  return raw
    .replace(/https?:\/\/doi\.org\//gi, "doi:")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Creates in-text citation string for a group of records according to style.
 */
export function buildInTextCitation(
  recordsToCite: ExploreRecord[],
  style: CitationStyle,
  vancouverIndexMap: Map<string, number>
): string {
  if (recordsToCite.length === 0) return "";

  if (style === "vancouver") {
    const indices = recordsToCite
      .map(r => vancouverIndexMap.get(r.pmid || r.title))
      .filter((n): n is number => typeof n === "number");
    if (indices.length === 0) return "";
    return `[${indices.join(", ")}]`;
  }

  if (style === "apa") {
    const parts = recordsToCite.map(r => singleRecordInText(r, "apa"));
    return `(${parts.join("; ")})`;
  }

  // Harvard
  const parts = recordsToCite.map(r => singleRecordInText(r, "harvard"));
  return `(${parts.join(", ")})`;
}

function extractStudyPopulation(context: string, title: string): string {
  const full = `${title}. ${context}`;
  const m1 = /\b(?:in|among|of|included?|enrolled?)\s+(\d+[\w\s-]{4,35}?(?:women|patients|men|participants|infants|couples|adults|individuals|cases|embryos|blastocysts))\b/i.exec(full);
  if (m1) return m1[1].trim();

  const m2 = /\b(?:patients|women|adults|participants|couples)\s+(?:with|undergoing|presenting with|diagnosed with|aged)\s+([\w\s-]{4,35}?)(?=[,.;:]|\bwere\b|\bwas\b|\bto\b|\band\b)/i.exec(full);
  if (m2) return `${m2[0].trim()}`.slice(0, 45);

  const m3 = /\b(\d+\s+(?:women|patients|participants|couples|cases|infants))\b/i.exec(full);
  if (m3) return m3[1].trim();

  return "Not extracted";
}

function extractStudyComparator(context: string, title: string): string {
  const full = `${title}. ${context}`;
  const m1 = /\b(?:compared with|versus|vs\.?)\s+([\w\s-]{3,35}?)(?=[,.;:]|\bfor\b|\bon\b|\band\b|\bin\b|\bwere\b|\bwas\b)/i.exec(full);
  if (m1) return m1[1].trim();

  const m2 = /\b(?:control group|placebo group|sham group|standard care group)\b/i.exec(full);
  if (m2) return m2[0].trim();

  return "Not extracted";
}

/**
 * Pure, deterministic composer for publication-grade scientific manuscripts.
 */
export function composeManuscript(input: ComposeManuscriptInput): ManuscriptData {
  const {
    words,
    category,
    phrase,
    screeningStats,
    records = [],
    userExcluded = [],
    specialty = "obgyn",
    style = "vancouver"
  } = input;

  // Filter out any excluded papers - strictly RETAINED records only
  const excludedSet = new Set((userExcluded || []).map(k => k.trim().toLowerCase()));
  const retained = records.filter(r => {
    const pmidKey = (r.pmid || "").trim().toLowerCase();
    const titleKey = (r.title || "").trim().toLowerCase();
    const doiKey = (r.doi || "").trim().toLowerCase();
    if (pmidKey && excludedSet.has(pmidKey)) return false;
    if (doiKey && excludedSet.has(doiKey)) return false;
    if (titleKey && excludedSet.has(titleKey)) return false;
    return true;
  });

  // Specialty Definition
  const specDef = getSpecialtyDefinition(specialty);

  // Structured PICO roles
  const popWord = words.find(w => w.role === "population")?.word || "specified clinical cohort";
  const intWord = words.find(w => w.role === "intervention")?.word || "clinical intervention";
  const compWord = words.find(w => w.role === "comparator")?.word || "standard comparator";
  const outWord = words.find(w => w.role === "outcome")?.word || "target clinical endpoint";

  // Evidence grounding calculation across retained records
  const validRetained = retained.filter(r => !isNonEvidenceItem(r).isNonEvidence);
  const elements = [
    { label: "P", value: popWord },
    { label: "I", value: intWord },
    ...(compWord ? [{ label: "C", value: compWord }] : []),
    ...(outWord ? [{ label: "O", value: outWord }] : [])
  ];

  // R1: Require intervention match. Generic comparators never satisfy intervention eligibility.
  const matchingRetained = validRetained.filter(r => {
    const audit = auditRef(r, elements);
    return Boolean(audit.population && audit.intervention && audit.outcome);
  });

  // Deterministic title template (plain clinical wording without P/I/C/O role markers)
  const cleanPhrase = phrase.replace(/\s+/g, " ").trim();
  const titlePhrase = cleanPhrase.replace(/\s*\([PICO]\)/g, "").replace(/\s+/g, " ").trim();
  let titleSuffix = "";
  if (category === "established") {
    titleSuffix = (retained.length === 0 || matchingRetained.length === 0)
      ? "A Rapid Evidence Synthesis: Insufficient Direct Evidence"
      : "A Rapid Evidence Summary of Established Clinical Knowledge";
  } else if (category === "conflicting") {
    titleSuffix = "A Rapid Evidence Summary of Conflicting Clinical Findings";
  } else {
    titleSuffix = "A Rapid Evidence Summary of Identified Clinical Literature Gaps";
  }
  const title = `${titlePhrase}: ${titleSuffix}`;

  // Partition retained records into relevance tiers
  const tier90 = retained.filter(r => (r.relevancePct ?? 0) >= 90);
  const tier70 = retained.filter(r => (r.relevancePct ?? 0) >= 70 && (r.relevancePct ?? 0) < 90);
  const tierLow = retained.filter(r => (r.relevancePct ?? 0) < 70);

  // Order of appearance for Vancouver numbering
  const vancouverOrder: ExploreRecord[] = [];
  const vancouverIndexMap = new Map<string, number>();

  const trackVancouver = (rec: ExploreRecord) => {
    const key = rec.pmid || rec.title;
    if (!vancouverIndexMap.has(key)) {
      vancouverOrder.push(rec);
      vancouverIndexMap.set(key, vancouverOrder.length);
    }
  };

  // Seed Vancouver appearance order by tier
  for (const r of tier90) trackVancouver(r);
  for (const r of tier70) trackVancouver(r);
  for (const r of tierLow) trackVancouver(r);

  // Group designs and calculate design mix percentages across retained records
  const designCounts: Record<string, number> = {};
  for (const r of retained) {
    const d = classifyPaperType({
      title: r.title,
      abstract: r.context,
      journal: r.journal,
      pubType: (r as unknown as { pubType?: string }).pubType,
      publicationTypes: (r as unknown as { publicationTypes?: string[] }).publicationTypes
    }) || "Observational Study";
    designCounts[d] = (designCounts[d] || 0) + 1;
  }
  const designSummary = retained.length > 0
    ? Object.entries(designCounts)
        .map(([d, cnt]) => `${cnt} ${d.toLowerCase()} (${Math.round((cnt / retained.length) * 100)}%)`)
        .join(", ")
    : "no studies";

  // Section 1: Background (Honest, evidence-derived, non-templated)
  const backgroundP1 = `In clinical decision-making within ${specDef.label}, evaluating the comparative effect of ${intWord} versus ${compWord} on ${outWord} in ${popWord} is essential to inform evidence-based practice. This rapid evidence summary characterizes the available literature base to address the clinical question.`;

  const backgroundP2Parts: string[] = [
    `This structured inquiry was parameterized into distinct clinical domains: Population (P): "${popWord}"; Intervention (I): "${intWord}"; Comparator (C): "${compWord}"; and Outcome (O): "${outWord}". Formal risk-of-bias and GRADE assessments were not performed.`
  ];

  if (specDef.authorityGuidelines) {
    backgroundP2Parts.push(
      `Evidence synthesis is situated within the clinical specialty of ${specDef.label}, referencing clinical standards of authoritative bodies (${specDef.authorityGuidelines}).`
    );
  }

  // Check if outcome aligns with specialty's ranked outcomes
  const outWordLower = outWord.toLowerCase();
  const matchedOutcome = specDef.outcomesRanked?.find(
    o => o.toLowerCase().includes(outWordLower) || outWordLower.includes(o.toLowerCase())
  );
  if (matchedOutcome) {
    backgroundP2Parts.push(
      `The evaluated endpoint ("${outWord}") aligns directly with prioritized clinical outcomes recognized in ${specDef.label} (notably ${matchedOutcome}).`
    );
  }

  const backgroundParagraphs = [
    backgroundP1,
    backgroundP2Parts.join(" ")
  ];

  // Section 2: Search strategy and screening
  const truthfulMethods = buildTruthfulMethodsText(outWord, input.searchLog);

  let searchP1: string;
  if (input.searchLog && input.searchLog.length > 0) {
    const queriedNames = input.searchLog.filter(s => s.ok || s.count !== undefined || s.query).map(s => s.name || s.id);
    const dbList = queriedNames.length > 0
      ? (queriedNames.length > 1 ? `${queriedNames.slice(0, -1).join(", ")} and ${queriedNames[queriedNames.length - 1]}` : queriedNames[0])
      : "indexed biomedical databases";
    const searchDate = input.searchLog[0]?.date || new Date().toISOString().slice(0, 10);
    const queryDetails = input.searchLog
      .filter(s => s.query)
      .map(s => `${s.name || s.id}: "${s.query}" (${s.count ?? 0} hits)`)
      .join("; ");
    searchP1 = `A structured evidence retrieval was conducted on ${searchDate} across ${dbList}. The search strategy mapped clinical concepts: ${words.map(w => `${w.role.toUpperCase()} "${w.word}"`).join(", ")}.${queryDetails ? ` Exact queries executed: ${queryDetails}.` : ""}`;
  } else {
    searchP1 = `A structured multi-database evidence retrieval protocol was conducted across indexed biomedical repositories. The search architecture utilized normalized PICO keywords: ${words.map(w => `${w.role.toUpperCase()} "${w.word}"`).join(", ")}.`;
  }

  const searchP2 = `The initial query ladder retrieved ${screeningStats.retrieved} records. Automated title/abstract relevance screening evaluated ${screeningStats.screened} records at search relaxation level ${screeningStats.relaxationLevel}. During exploratory screening, ${screeningStats.excludedCount} record(s) were excluded based on study design or tangential relevance criteria, leaving ${retained.length} prioritized record(s) retained for formal synthesis.`;
  const searchParagraphs = [searchP1, searchP2, truthfulMethods];

  const actionVerb = outcomeActionVerb(outWord);
  let favourable = 0;
  let neutral = 0;
  let adverse = 0;

  for (const r of matchingRetained) {
    const finding = extractFinding(r, outWord, popWord);
    if (finding) {
      const dir = assertedDirection(finding);
      if (dir === (actionVerb === "reduce" ? "reduction" : "increase")) favourable++;
      else if (dir === "no-difference") neutral++;
      else if (dir) adverse++;
    }
  }

  // P0-2 Evidence-derived conclusion sentence: identical regardless of chosen category button
  let evidenceConclusion = "";
  if (retained.length === 0 || matchingRetained.length === 0) {
    evidenceConclusion = `Insufficient direct evidence was identified to determine the comparative effect of ${intWord} versus ${compWord} on ${outWord} in ${popWord}.`;
  } else if (favourable > 0 && neutral === 0 && adverse === 0) {
    evidenceConclusion = `Synthesized evidence from ${retained.length} retained study record(s) (${designSummary}) demonstrates consistent direct support for ${intWord} regarding ${outWord} in ${popWord}.`;
  } else if ((favourable > 0 && neutral > 0) || (favourable > 0 && adverse > 0)) {
    evidenceConclusion = `Synthesized evidence from ${retained.length} retained study record(s) (${designSummary}) reveals conflicting directional findings regarding ${intWord} versus ${compWord} for ${outWord} in ${popWord}.`;
  } else if (neutral > 0 && favourable === 0 && adverse === 0) {
    evidenceConclusion = `Synthesized evidence from ${retained.length} retained study record(s) (${designSummary}) indicates no significant difference between ${intWord} and ${compWord} on ${outWord} in ${popWord}.`;
  } else {
    evidenceConclusion = `Available evidence from ${retained.length} retained study record(s) (${designSummary}) addresses this comparison, but abstracts provide insufficient direct effect estimates to establish definitive clinical consensus for ${outWord} in ${popWord}.`;
  }

  // Section 3: Evidence synthesis (Study extraction table and factual extraction)
  const synthesisParagraphs: string[] = [];
  if (retained.length === 0) {
    synthesisParagraphs.push(
      "Following screening and exploratory exclusion, zero records met the eligibility criteria for formal synthesis. Further primary trials or broadening of search terms may be required to characterize this clinical question."
    );
  } else {
    const years = retained.map(r => parseInt(r.year || "0", 10)).filter(y => y > 1900);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    const yearRangeStr = minYear && maxYear ? `spanning from ${minYear} to ${maxYear}` : "from recent publication years";
    const journalSet = new Set(retained.map(r => r.journal).filter(Boolean));
    const journalCount = journalSet.size;

    synthesisParagraphs.push(
      `The prioritized evidence base comprises ${retained.length} retained study record(s) ${yearRangeStr} across ${journalCount} peer-reviewed journal venue(s). Methodological design mix comprises ${designSummary}. Records were evaluated against the clinical PICO parameters.`
    );

    // Study extraction summary sentences
    const studySentences = retained.map(r => {
      const finding = extractFinding(r, outWord, popWord);
      const itemCite = buildInTextCitation([r], style, vancouverIndexMap);
      const parsedAuthors = parseAuthorNames(r.authors || "");
      const authorText = parsedAuthors[0]?.surname ? `${parsedAuthors[0].surname} et al.` : "Authors";
      if (finding) {
        return `"${r.title}" (${authorText}, ${r.year || "n.d."}) ${itemCite} reported: "${finding}"`;
      }
      return `"${r.title}" (${authorText}, ${r.year || "n.d."}) ${itemCite} (no direct outcome sentence extractable from abstract)`;
    });

    synthesisParagraphs.push(`Study extractions: ${studySentences.join(". ")}.`);

    // Per-study extraction table (P0-3, R10)
    const tableHeader = "| Citation | Study Design | Population | Comparator | Reported Finding / Direction | Risk of Bias |";
    const tableSep = "| --- | --- | --- | --- | --- | --- |";
    const tableRows = retained.map(r => {
      const d = classifyPaperType({
        title: r.title,
        abstract: r.context,
        journal: r.journal,
        pubType: (r as unknown as { pubType?: string }).pubType,
        publicationTypes: (r as unknown as { publicationTypes?: string[] }).publicationTypes
      }) || "Observational Study";
      const itemCite = buildInTextCitation([r], style, vancouverIndexMap);
      const finding = extractFinding(r, outWord, popWord) || "Not stated in abstract";
      const cleanFinding = finding.length > 80 ? finding.slice(0, 77) + "…" : finding;

      const popDisplay = extractStudyPopulation(r.context || "", r.title);
      const compDisplay = extractStudyComparator(r.context || "", r.title);
      return `| ${itemCite || r.title.slice(0, 25)} | ${d} | ${popDisplay} | ${compDisplay} | ${cleanFinding.replace(/\|/g, "\\|")} | Risk of bias: not assessed |`;
    });
    synthesisParagraphs.push([tableHeader, tableSep, ...tableRows].join("\n"));
  }

  // Section 4: Limitations
  const limitationsParagraphs: string[] = [
    `This evidence synthesis is subject to specific methodological boundaries. Formal risk-of-bias and GRADE assessments were not performed; appraisal is based on available indexing metadata and abstracts. First, the scope is strictly constrained to the four defined PICO parameters, potentially omitting adjacent clinical variations. Second, initial screening was conducted at the title and abstract metadata level, which may overlook detailed subgroup findings documented only within full-text reports. Third, this synthesis is deliberately bounded by the clinical framework of ${specDef.label}; generalizability to multi-disciplinary or broader health domains should be verified independently.`
  ];
  const limP2Parts = [
    `${screeningStats.excludedCount} record(s) were excluded during exploration based on metadata screening.`
  ];
  if (screeningStats.relaxationLevel > 0) {
    limP2Parts.push(
      `Search relaxation level ${screeningStats.relaxationLevel} was utilized during query ladder execution to expand candidate retrieval, which introduces broader publication designs.`
    );
  }
  limP2Parts.push(
    "Finally, non-indexed grey literature and unpublished negative trial registries were not exhaustively queried, which should be considered when interpreting overall evidence completeness."
  );
  limitationsParagraphs.push(limP2Parts.join(" "));

  // Section 5: Conclusion
  const conclusionP1 = `In conclusion, ${evidenceConclusion}`;
  const conclusionP2 = "Recommended clinical research workup: Investigators should conduct full-text appraisal of all prioritized citations, execute standardized risk-of-bias evaluation (e.g., Cochrane RoB 2 or ROBINS-I), register prospective systematic reviews with PROSPERO, and establish defined cohort monitoring protocols.";

  const sections: ManuscriptSection[] = [
    {
      heading: "Background",
      paragraphs: backgroundParagraphs
    },
    {
      heading: "Search strategy and screening",
      paragraphs: searchParagraphs
    },
    {
      heading: "Evidence synthesis",
      paragraphs: synthesisParagraphs
    },
    {
      heading: "Limitations",
      paragraphs: limitationsParagraphs
    },
    {
      heading: "Conclusion",
      paragraphs: [conclusionP1, conclusionP2]
    }
  ];

  // Abstract - 4 labeled sentences
  const absObjective = `Objective: To evaluate and synthesize available clinical evidence regarding the question: "${cleanPhrase}".`;
  const absMethods = `Methods: A structured search identified ${screeningStats.retrieved} records; ${screeningStats.screened} records were screened at search relaxation level ${screeningStats.relaxationLevel}, and ${screeningStats.excludedCount} record(s) were excluded during exploratory curation.`;
  const absResults = retained.length > 0
    ? `Results: A total of ${retained.length} prioritized record(s) met inclusion criteria across ${designSummary}, with ${tier90.length} study record(s) demonstrating ≥90% alignment with the clinical PICO parameters.`
    : `Results: Zero records met final eligibility criteria for formal synthesis following screening and exclusion filters.`;
  const absConclusion = `Conclusion: ${evidenceConclusion}`;

  const abstract = [
    absObjective,
    absMethods,
    absResults,
    absConclusion
  ];

  // Build references list formatted according to selected style
  let references: string[] = [];
  if (style === "vancouver") {
    // Vancouver order corresponds to first appearance
    references = vancouverOrder.map((r, idx) => formatPlainReference(r, "vancouver", idx + 1));
  } else {
    // APA and Harvard sort alphabetically by first author surname
    const sorted = [...retained].sort((a, b) => {
      const aName = (a.authors || "").toLowerCase();
      const bName = (b.authors || "").toLowerCase();
      return aName.localeCompare(bName);
    });
    references = sorted.map((r, idx) => formatPlainReference(r, style, idx + 1));
  }

  return {
    title,
    abstract,
    sections,
    references,
    citationStyle: style,
    aiEnriched: false,
    evidenceConclusion
  };
}

/**
 * Counts total words across abstract and all section paragraphs.
 */
export function countManuscriptWords(m: { abstract?: string[]; sections?: ManuscriptSection[] }): number {
  let count = 0;
  if (Array.isArray(m.abstract)) {
    for (const sent of m.abstract) {
      count += sent.trim().split(/\s+/).filter(Boolean).length;
    }
  }
  if (Array.isArray(m.sections)) {
    for (const sec of m.sections) {
      for (const p of sec.paragraphs) {
        count += p.trim().split(/\s+/).filter(Boolean).length;
      }
    }
  }
  return count;
}

/**
 * Hard validation of LLM-enriched manuscript text before acceptance.
 * Discards the AI text and returns null on ANY integrity violation.
 */
export function validateEnrichedManuscript(
  rawLlm: unknown,
  deterministic: ManuscriptData,
  retained: ExploreRecord[],
  style: CitationStyle
): ManuscriptData | null {
  if (!rawLlm || typeof rawLlm !== "object") return null;
  const candidate = rawLlm as Record<string, unknown>;

  // 1. Validate sections structure
  if (!Array.isArray(candidate.sections) || candidate.sections.length !== EXPECTED_HEADINGS.length) {
    return null;
  }

  const validatedSections: ManuscriptSection[] = [];
  for (let i = 0; i < EXPECTED_HEADINGS.length; i++) {
    const sec = candidate.sections[i] as { heading?: unknown; paragraphs?: unknown };
    if (!sec || typeof sec !== "object") return null;
    const heading = typeof sec.heading === "string" ? sec.heading.trim() : "";
    if (heading.toLowerCase() !== EXPECTED_HEADINGS[i].toLowerCase()) {
      return null;
    }
    if (!Array.isArray(sec.paragraphs) || sec.paragraphs.length === 0) {
      return null;
    }
    const paragraphs: string[] = [];
    for (const p of sec.paragraphs) {
      if (typeof p !== "string" || !p.trim()) return null;
      paragraphs.push(p.trim());
    }
    validatedSections.push({ heading: EXPECTED_HEADINGS[i], paragraphs });
  }

  // 2. Validate abstract
  let validatedAbstract: string[] = [];
  if (Array.isArray(candidate.abstract)) {
    validatedAbstract = candidate.abstract.filter((s): s is string => typeof s === "string" && !!s.trim());
  } else if (typeof candidate.abstract === "string" && candidate.abstract.trim()) {
    validatedAbstract = candidate.abstract.split(/(?<=[.?!])\s+/).filter(Boolean);
  }
  if (validatedAbstract.length === 0 || validatedAbstract.length > 8) {
    return null;
  }

  // 3. Check for external URLs, DOIs or hyperlinks
  const allProse = [
    ...validatedAbstract,
    ...validatedSections.flatMap(s => s.paragraphs)
  ].join(" ");

  if (/https?:\/\/|www\./i.test(allProse)) {
    return null; // Zero external links permitted
  }

  // 4. Word-count sanity bound (0.5x to 1.75x of deterministic word count)
  const detWords = countManuscriptWords(deterministic);
  const aiWords = countManuscriptWords({ abstract: validatedAbstract, sections: validatedSections });
  if (detWords > 0) {
    if (aiWords < 0.5 * detWords || aiWords > 1.75 * detWords) {
      return null; // Runaway or overly truncated output rejected
    }
  }

  // 5. In-text citation integrity check
  if (style === "vancouver") {
    const bracketMatches = allProse.matchAll(/\[([\d\s,\-]+)\]/g);
    for (const match of bracketMatches) {
      const inner = match[1];
      const parts = inner.split(/[,;\-]+/);
      for (const part of parts) {
        const clean = part.trim();
        if (!clean) continue;
        const num = parseInt(clean, 10);
        if (isNaN(num) || num < 1 || num > retained.length) {
          return null; // Out of bounds citation marker
        }
      }
    }
  } else {
    // APA or Harvard: verify that cited author surnames match retained records
    const knownSurnames = new Set(
      retained.flatMap(r => parseAuthorNames(r.authors).map(a => a.surname.toLowerCase().replace(/[^a-z]/g, "")))
    );
    const parenMatches = allProse.matchAll(/\(([A-Za-z\s&,.\-']+?)(?:,|\s)\s*(\d{4}|n\.d\.)\)/g);
    for (const match of parenMatches) {
      const authorPart = match[1].toLowerCase();
      const names = authorPart
        .split(/\s+(?:&|and)\s+|,\s*/)
        .map(s => s.replace(/\bet\s+al\.?/i, "").replace(/[^a-z]/g, "").trim())
        .filter(Boolean);
      for (const name of names) {
        if (name && !knownSurnames.has(name) && name !== "anonymous") {
          return null; // Invented or unverified author citation
        }
      }
    }
  }

  const title = typeof candidate.title === "string" && candidate.title.trim()
    ? candidate.title.replace(/\s*\([PICO]\)/g, "").replace(/\s+/g, " ").trim()
    : deterministic.title;

  return {
    title,
    abstract: validatedAbstract,
    sections: validatedSections,
    references: deterministic.references,
    citationStyle: style,
    aiEnriched: true
  };
}
