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
  };
  hasMore: boolean;
  phrase?: string;
  category?: string;
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
    matchedElements: (r.matchedElements || []).map(code => ELEMENT_LABELS[code] || code)
  }));

  const retrieved = screenSnapshot?.corpusStats?.retrieved ?? exploreSnapshot?.corpusStats?.retrieved ?? 0;
  const screened = screenSnapshot?.corpusStats?.screened ?? exploreSnapshot?.corpusStats?.screened ?? 0;
  const relaxationLevel = screenSnapshot?.corpusStats?.relaxationLevel ?? 0;
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
    phrase: choice.phrase,
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
