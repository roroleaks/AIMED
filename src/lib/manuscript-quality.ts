import type { AuditableRef, PicoElement } from "./relevance.ts";
import { extractInTextCites, extractNumericCites } from "./relevance.ts";
import { ASSERTION, claimText } from "./claim-finalization.ts";

export interface ManuscriptSection {
  heading: string;
  blocks: string[];
  table?: {
    headers: string[];
    rows: string[][];
  };
}

export interface QualityRuleResult {
  rule: string;
  passed: boolean;
  severity: "error" | "warning";
  message: string;
  details?: unknown;
}

export interface ManuscriptQualityReport {
  passed: boolean; // false if any severity === "error" rule failed
  wordCounts: Record<string, number>;
  rules: QualityRuleResult[];
  untraceableStats: string[];
  duplicatedSentences: string[];
  uncitedAssertions: string[];
  hedgingViolations: string[];
  markdownArtifacts: string[];
}

export interface QualityLintInput {
  title?: string;
  abstract?: string;
  introduction?: string;
  methods?: string;
  results?: string;
  discussion?: string;
  conclusion?: string;
  sections?: ManuscriptSection[];
  references?: string[];
  retainedRecords?: AuditableRef[];
  elements?: PicoElement[];
  isSparse?: boolean;
}

/** Standard word floor and ceiling limits for IMRaD sections */
export const WORD_LIMITS = {
  abstract: { min: 250, max: 350 },
  introduction: { min: 250, max: 800 },
  methods: { min: 400, max: 1200 },
  results: { min: 400, max: 1500 },
  discussion: { min: 400, max: 1500 },
  conclusion: { min: 100, max: 200 }
} as const;

/** Patterns of statistics that must be grounded in cited literature abstracts */
export const STATISTIC_PATTERN = /\b\d+(?:\.\d+)?%|\bp\s*[=<]\s*0?\.\d+|\b95%\s*CI\b|\b(?:HR|RR|OR)\s*[=:]\s*\d+(?:\.\d+)?/gi;

/** Hedging vocabulary tiers */
export const HEDGING_TIERS = {
  strong: [
    "consistently showed",
    "consistently demonstrated",
    "consistently observed",
    "conclusively shows",
    "conclusively proves",
    "proves that",
    "definitively establishes"
  ],
  moderate: [
    "evidence suggests",
    "findings suggest",
    "suggests that",
    "may improve",
    "observed in",
    "reported that"
  ],
  cautious: [
    "insufficient evidence",
    "sparse evidence",
    "limited evidence",
    "preliminary",
    "inconclusive",
    "remains uncertain",
    "no direct evidence"
  ]
} as const;

/** Count words in a string, ignoring markdown table markup and headers */
export function countWords(text: string): number {
  if (!text) return 0;
  // Remove markdown tables, headers, and reference brackets before word counting
  const cleaned = text
    .replace(/^\|.*\|$/gm, " ") // table lines
    .replace(/^#{1,6}\s+.*$/gm, " ") // header lines
    .replace(/\[[^\]]+\]/g, " ") // [1], [1, 2], [1-3]
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/** Split narrative into sentences */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^\|.*\|$/gm, "") // ignore table rows
    .replace(/^#{1,6}\s+.*$/gm, "") // ignore headers
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

/** Normalize sentence for duplicate detection */
export function normalizeSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Audit and lint a manuscript against the six quality criteria:
 * 1. No duplicated boilerplate (>8 words between sections)
 * 2. Word floors enforced
 * 3. Honesty scan (untraceable statistics)
 * 4. Citation coverage on assertive sentences
 * 5. Hedging calibration
 * 6. Rendered output hygiene (no unrendered markdown)
 */
export function lintManuscriptQuality(input: QualityLintInput): ManuscriptQualityReport {
  const sectionsMap: Record<string, string> = {
    abstract: input.abstract || "",
    introduction: input.introduction || "",
    methods: input.methods || "",
    results: input.results || "",
    discussion: input.discussion || "",
    conclusion: input.conclusion || ""
  };

  // If sections array provided, merge blocks into sectionsMap
  if (Array.isArray(input.sections)) {
    for (const sec of input.sections) {
      const h = (sec.heading || "").toLowerCase().trim();
      for (const key of Object.keys(sectionsMap)) {
        if (h.includes(key)) {
          sectionsMap[key] = sec.blocks.join("\n\n");
        }
      }
    }
  }

  const wordCounts: Record<string, number> = {};
  for (const [k, text] of Object.entries(sectionsMap)) {
    wordCounts[k] = countWords(text);
  }

  const rules: QualityRuleResult[] = [];
  const untraceableStats: string[] = [];
  const duplicatedSentences: string[] = [];
  const uncitedAssertions: string[] = [];
  const hedgingViolations: string[] = [];
  const markdownArtifacts: string[] = [];

  const records = input.retainedRecords || [];
  const elements = input.elements || [];
  const isSparse = input.isSparse || records.length === 0;

  // --------------------------------------------------------------------------
  // Rule 1: No duplicated boilerplate (>8 words between sections)
  // --------------------------------------------------------------------------
  const sentenceOccurrences = new Map<string, { section: string; original: string }[]>();
  for (const [secName, text] of Object.entries(sectionsMap)) {
    const sents = splitSentences(text);
    for (const s of sents) {
      const norm = normalizeSentence(s);
      const wCount = norm.split(/\s+/).filter(Boolean).length;
      if (wCount > 8) {
        const existing = sentenceOccurrences.get(norm) || [];
        existing.push({ section: secName, original: s });
        sentenceOccurrences.set(norm, existing);
      }
    }
  }

  for (const [, occurrences] of sentenceOccurrences) {
    const distinctSections = new Set(occurrences.map(o => o.section));
    if (distinctSections.size > 1) {
      const desc = `"${occurrences[0].original.slice(0, 70)}..." appears in ${Array.from(distinctSections).join(", ")}`;
      if (!duplicatedSentences.includes(desc)) {
        duplicatedSentences.push(desc);
      }
    }
  }

  if (duplicatedSentences.length > 0) {
    rules.push({
      rule: "no-duplicated-boilerplate",
      passed: false,
      severity: "error",
      message: `Duplicated sentence(s) (>8 words) found across distinct sections: ${duplicatedSentences.length} violation(s)`,
      details: duplicatedSentences
    });
  } else {
    rules.push({
      rule: "no-duplicated-boilerplate",
      passed: true,
      severity: "error",
      message: "No duplicated sentences (>8 words) detected across sections."
    });
  }

  // --------------------------------------------------------------------------
  // Rule 2: Word floors enforced
  // --------------------------------------------------------------------------
  let wordFloorsPassed = true;
  const wordFloorViolations: string[] = [];

  if (!isSparse) {
    for (const [sec, limits] of Object.entries(WORD_LIMITS)) {
      const count = wordCounts[sec] || 0;
      if (count < limits.min) {
        wordFloorsPassed = false;
        wordFloorViolations.push(`${sec} has ${count} words (minimum required: ${limits.min})`);
      } else if ("max" in limits && count > limits.max) {
        wordFloorsPassed = false;
        wordFloorViolations.push(`${sec} has ${count} words (maximum allowed: ${limits.max})`);
      }
    }
  }

  rules.push({
    rule: "word-floors",
    passed: wordFloorsPassed,
    severity: "error",
    message: wordFloorsPassed
      ? "All sections meet prescribed word floor and ceiling limits."
      : `Word limit violations: ${wordFloorViolations.join("; ")}`,
    details: wordFloorViolations
  });

  // --------------------------------------------------------------------------
  // Rule 3: Honesty scan (untraceable statistics)
  // --------------------------------------------------------------------------
  const allNarrativeText = Object.entries(sectionsMap)
    .filter(([sec]) => sec !== "methods") // exclude search query formulas in methods
    .map(([, t]) => t)
    .join(" ");

  const combinedAbstracts = records
    .map(r => `${r.title || ""} ${r.context || ""}`)
    .join(" ")
    .toLowerCase();

  const statMatches = allNarrativeText.match(STATISTIC_PATTERN) || [];
  for (const match of statMatches) {
    const cleanMatch = match.trim().toLowerCase();
    // Verify if this statistical token exists in the cited abstract contexts
    if (!combinedAbstracts.includes(cleanMatch)) {
      // Also check normalized number e.g. "95% ci"
      const numOnly = cleanMatch.replace(/[^\d.]/g, "");
      if (!numOnly || !combinedAbstracts.includes(numOnly)) {
        if (!untraceableStats.includes(match)) {
          untraceableStats.push(match);
        }
      }
    }
  }

  if (untraceableStats.length > 0) {
    rules.push({
      rule: "honesty-scan",
      passed: false,
      severity: "error",
      message: `Untraceable numerical statistics found in manuscript narrative: ${untraceableStats.join(", ")}`,
      details: untraceableStats
    });
  } else {
    rules.push({
      rule: "honesty-scan",
      passed: true,
      severity: "error",
      message: "All reported numerical statistics are grounded in cited record abstracts."
    });
  }

  // --------------------------------------------------------------------------
  // Rule 4: Citation coverage on assertive sentences
  // --------------------------------------------------------------------------
  const sectionsToCheck = ["introduction", "results", "discussion"];
  for (const sec of sectionsToCheck) {
    const text = sectionsMap[sec] || "";
    const sents = splitSentences(text);
    for (const s of sents) {
      // Check if assertive
      if (ASSERTION.test(claimText(s, elements))) {
        const hasAuthorCite = extractInTextCites(s).length > 0;
        const hasNumericCite = extractNumericCites(s).citedNumbers.size > 0;
        if (!hasAuthorCite && !hasNumericCite) {
          uncitedAssertions.push(`[${sec}] "${s.slice(0, 80)}..."`);
        }
      }
    }
  }

  if (uncitedAssertions.length > 0) {
    rules.push({
      rule: "citation-coverage",
      passed: false,
      severity: "error",
      message: `Assertive sentence(s) in clinical sections lacking in-text citation: ${uncitedAssertions.length} found`,
      details: uncitedAssertions
    });
  } else {
    rules.push({
      rule: "citation-coverage",
      passed: true,
      severity: "error",
      message: "Every assertive sentence in Introduction, Results, and Discussion carries an in-text citation."
    });
  }

  // --------------------------------------------------------------------------
  // Rule 5: Hedging calibration
  // --------------------------------------------------------------------------
  // If evidence is sparse (< 2 records) or mixed, strong conclusive claims are forbidden
  const fullTextLower = Object.values(sectionsMap).join(" ").toLowerCase();
  const usesStrongHedging = HEDGING_TIERS.strong.some(term => fullTextLower.includes(term));

  if (records.length < 2 && usesStrongHedging) {
    hedgingViolations.push("Strong conclusive language ('consistently showed / proved') used with fewer than 2 retained records.");
  }

  if (hedgingViolations.length > 0) {
    rules.push({
      rule: "hedging-calibration",
      passed: false,
      severity: "error",
      message: `Hedging calibration violation: ${hedgingViolations.join("; ")}`,
      details: hedgingViolations
    });
  } else {
    rules.push({
      rule: "hedging-calibration",
      passed: true,
      severity: "error",
      message: "Hedging vocabulary matches evidence pool strength and consistency."
    });
  }

  // --------------------------------------------------------------------------
  // Rule 6: Rendered-output hygiene (no literal markdown in final blocks)
  // --------------------------------------------------------------------------
  // Checks if any raw markdown headings (###) or code blocks (```) leak into plain text blocks
  if (Array.isArray(input.sections)) {
    for (const sec of input.sections) {
      for (const block of sec.blocks) {
        if (/```|~~|^\s*#{1,6}\s+/m.test(block)) {
          markdownArtifacts.push(`Section "${sec.heading}": ${block.slice(0, 50)}...`);
        }
      }
    }
  }

  if (markdownArtifacts.length > 0) {
    rules.push({
      rule: "rendered-output-hygiene",
      passed: false,
      severity: "warning",
      message: `Unrendered markdown syntax found in output blocks: ${markdownArtifacts.length}`,
      details: markdownArtifacts
    });
  } else {
    rules.push({
      rule: "rendered-output-hygiene",
      passed: true,
      severity: "error",
      message: "Rendered output hygiene clean: zero raw markdown headers or fences."
    });
  }

  const passed = rules.filter(r => r.severity === "error").every(r => r.passed);

  return {
    passed,
    wordCounts,
    rules,
    untraceableStats,
    duplicatedSentences,
    uncitedAssertions,
    hedgingViolations,
    markdownArtifacts
  };
}
