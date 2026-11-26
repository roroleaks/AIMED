import type { PicoWord } from "./pico-roles.ts";
import type { ScreenPayload } from "./deterministic-screen.ts";
import type { ExploreRecord } from "./explore-scoring.ts";
import type { ExcludedState } from "./session.ts";
import type { ManuscriptData, ManuscriptSection } from "./manuscript-composer.ts";
import { designOf } from "./relevance.ts";
import { getSpecialtyDefinition } from "./specialties.ts";

export interface ExploreSnapshot {
  records: ExploreRecord[];
  corpusStats: {
    retrieved: number;
    screened: number;
    blocked: number;
    returned: number;
    relaxationLevel?: number;
  };
  hasMore: boolean;
  phrase?: string;
  category?: string;
  searchLog?: Array<{
    id: string;
    name?: string;
    query?: string;
    count?: number;
    attempted?: boolean;
    ok?: boolean;
    skipped?: string;
    error?: string;
    date?: string;
  }>;
}

export interface ChoiceState {
  category: "established" | "conflicting" | "gap";
  phrase: string;
}

export interface WorkflowExportPaper {
  rank: number;
  relevancePct: number;
  title: string;
  authors: string;
  journal: string;
  year: string;
  design: string;
  matchedElements: string[];
  pmid?: string;
  doi?: string;
  context?: string;
  _sig?: string;
}

export interface WorkflowExportData {
  words: Array<{
    word: string;
    role: string;
  }>;
  category: "established" | "conflicting" | "gap";
  phrase: string;
  specialty?: string;
  specialtyLabel?: string;
  screeningStats: {
    retrieved: number;
    screened: number;
    relaxationLevel: number;
    excludedCount: number;
  };
  papers: WorkflowExportPaper[];
  title?: string;
  abstract?: string[];
  sections?: ManuscriptSection[];
  references?: string[];
  citationStyle?: "vancouver" | "apa" | "harvard";
  aiEnriched?: boolean;
  author?: string | null;
}

export const ELEMENT_LABELS: Record<string, string> = {
  P: "Population",
  I: "Intervention",
  C: "Comparator",
  O: "Outcome",
  population: "Population",
  intervention: "Intervention",
  comparator: "Comparator",
  outcome: "Outcome"
};

/**
 * Builds the canonical workflow export data from session snapshots.
 * Single source of truth for both display and document export.
 */
/** The export routes refuse a phrase over 240 characters; the on-screen phrase can run longer. */
export const MAX_EXPORT_PHRASE_LENGTH = 240;

/** Shorten a phrase for an export request between whole words, never mid-word. */
export function fitExportPhrase(phrase: string, max: number = MAX_EXPORT_PHRASE_LENGTH): string {
  const clean = phrase.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max - 1);
  if (clean.charAt(max - 1) !== " ") cut = cut.replace(/\s+\S*$/, "");
  return `${cut.replace(/[\s,;:(\-\/]+$/, "")}\u2026`;
}

export function buildSummaryPayload(
  words: PicoWord[],
  choice: ChoiceState,
  screenSnapshot: ScreenPayload | null,
  exploreSnapshot: ExploreSnapshot | null,
  excludedState: ExcludedState | null,
  manuscript?: ManuscriptData | null,
  specialty?: string
): WorkflowExportData {
  const records = exploreSnapshot?.records || [];
  const papers: WorkflowExportPaper[] = records.map((r, idx) => ({
    rank: idx + 1,
    relevancePct: r.relevancePct ?? 0,
    title: r.title,
    authors: r.authors || "",
    journal: r.journal || "",
    year: r.year || "",
    design: designOf(r.title || "", r.journal || "") || "Observational study",
    matchedElements: r.matchedElements || [],
    pmid: r.pmid,
    doi: r.doi,
    context: r.context,
    _sig: r._sig
  }));

  const retrieved = exploreSnapshot?.corpusStats?.retrieved ?? screenSnapshot?.corpusStats?.retrieved ?? 0;
  const screened = exploreSnapshot?.corpusStats?.screened ?? screenSnapshot?.corpusStats?.screened ?? 0;
  const relaxationLevel = exploreSnapshot?.corpusStats?.relaxationLevel ?? screenSnapshot?.corpusStats?.relaxationLevel ?? 0;
  const excludedCount = excludedState?.userExcluded?.length ?? 0;

  const specId = specialty || "obgyn";
  let specLabel = specId;
  try {
    const def = getSpecialtyDefinition(specId);
    if (def) specLabel = def.label;
  } catch {
    // Keep fallback specLabel
  }

  const base: WorkflowExportData = {
    words: words.map(w => ({
      word: w.word,
      role: w.role
    })),
    category: choice.category,
    phrase: fitExportPhrase(choice.phrase),
    specialty: specId,
    specialtyLabel: specLabel,
    screeningStats: {
      retrieved,
      screened,
      relaxationLevel,
      excludedCount
    },
    papers
  };

  if (manuscript) {
    base.title = manuscript.title;
    base.abstract = manuscript.abstract;
    base.sections = manuscript.sections;
    base.references = manuscript.references;
    base.citationStyle = manuscript.citationStyle;
    base.aiEnriched = manuscript.aiEnriched;
  }

  return base;
}
