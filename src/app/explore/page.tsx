"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatedProcessingIndicator } from "@/components/AnimatedProcessingIndicator";
import {
  sget,
  sset,
  resetSession,
  KEYS,
  isMatchingExploreCache,
  type ExcludedState
} from "@/lib/session";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { useAimedContext } from "@/context/AimedContext";
import type { PicoWord } from "@/lib/pico-roles";
import {
  type ExploreRecord,
  normalizeTitle,
  refCanonicalKeys
} from "@/lib/explore-scoring";
import { DRAFT_DISCLAIMER } from "@/lib/version";
import { AppFooter } from "@/components/AppFooter";
import { AuthorHeaderRight } from "@/components/AuthorHeaderRight";

interface ChoiceSession {
  category: "established" | "conflicting" | "gap";
  phrase: string;
}

interface ExploreResponse {
  records: ExploreRecord[];
  corpusStats: {
    retrieved: number;
    screened: number;
    blocked: number;
    returned: number;
    relaxationLevel: number;
  };
  sources?: Array<{
    id: string;
    ok: boolean;
    count: number;
  }>;
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
  hasMore: boolean;
}

const CATEGORY_META = {
  established: {
    label: "✅ i — Established knowledge",
    badgeBg: "#ecfdf5",
    badgeColor: "#065f46",
    borderColor: "#10b981"
  },
  conflicting: {
    label: "⚖️ ii — Conflicting evidence",
    badgeBg: "#fffbeb",
    badgeColor: "#92400e",
    borderColor: "#f59e0b"
  },
  gap: {
    label: "🔍 iii — Research gap",
    badgeBg: "#faf5ff",
    badgeColor: "#5b21b6",
    borderColor: "#8b5cf6"
  }
};

const ELEMENT_LABELS: Record<string, string> = {
  P: "Population",
  I: "Intervention",
  C: "Comparator",
  O: "Outcome"
};

function formatSourceName(id: string): string {
  const map: Record<string, string> = {
    pubmed: "PubMed",
    pmc: "Europe PMC",
    cochrane: "Cochrane",
    openalex: "OpenAlex",
    crossref: "CrossRef",
    semantic_scholar: "Semantic Scholar",
    clinicaltrials: "ClinicalTrials.gov",
    doaj: "DOAJ"
  };
  return map[id] || id;
}

export default function ExplorePage() {
  const router = useRouter();
  const { specialty, currentSpecialty } = useAimedContext();
  const [choice, setChoice] = useState<ChoiceSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [exploreData, setExploreData] = useState<ExploreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userExcluded, setUserExcluded] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);

  const activeSpecialty = specialty || sget<string>(KEYS.specialty) || "obgyn";

  // Initialize or read exclusion state from session
  const getOrInitExcluded = useCallback((currentChoice: ChoiceSession): ExcludedState => {
    const stored = sget<ExcludedState>(KEYS.excluded);
    if (stored && stored.phrase === currentChoice.phrase && stored.category === currentChoice.category) {
      return stored;
    }
    const fresh: ExcludedState = {
      phrase: currentChoice.phrase,
      category: currentChoice.category,
      userExcluded: [],
      seen: []
    };
    sset(KEYS.excluded, fresh);
    return fresh;
  }, []);

  const fetchExplore = useCallback(async (
    targetChoice: ChoiceSession,
    activeExcluded: string[],
    activeSeen: string[],
    force = false
  ) => {
    const rawWords = sget<PicoWord[]>(KEYS.picoWords);
    if (!rawWords || !Array.isArray(rawWords) || rawWords.length < 3 || rawWords.length > 5) {
      router.replace("/");
      return;
    }

    if (!force) {
      const cached = sget<ExploreResponse & { phrase: string; category: string; specialty?: string }>(KEYS.explore);
      const currentExcludedState = sget<ExcludedState>(KEYS.excluded);
      if (
        cached &&
        isMatchingExploreCache(cached, targetChoice, currentExcludedState, activeSpecialty) &&
        cached.specialty === activeSpecialty
      ) {
        setExploreData(cached);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "explore",
          choice: {
            category: targetChoice.category,
            phrase: targetChoice.phrase
          },
          words: rawWords,
          specialty: activeSpecialty,
          excluded: {
            userExcluded: activeExcluded,
            seen: activeSeen
          }
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null as { error?: string } | null);
        setError(body?.error || `The exploration service returned an error (${res.status}). Please try again.`);
        return;
      }

      const data: ExploreResponse = await res.json();
      const snapshot = {
        ...data,
        phrase: targetChoice.phrase,
        category: targetChoice.category,
        specialty: activeSpecialty
      };
      setExploreData(snapshot);
      sset(KEYS.explore, snapshot);

      // Append newly returned titles/keys to seen state in session
      const newKeys: string[] = [];
      for (const r of data.records || []) {
        const norm = normalizeTitle(r.title || "");
        if (norm) newKeys.push(norm);
        newKeys.push(...refCanonicalKeys(r));
      }
      const updatedSeen = Array.from(new Set([...activeSeen, ...newKeys]));
      setSeen(updatedSeen);
      sset(KEYS.excluded, {
        phrase: targetChoice.phrase,
        category: targetChoice.category,
        userExcluded: activeExcluded,
        seen: updatedSeen
      });
    } catch {
      setError("Network or server error during evidence exploration. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [activeSpecialty, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const storedWords = sget<PicoWord[]>(KEYS.picoWords);
      const storedChoice = sget<ChoiceSession>(KEYS.choice);

      if (!storedWords || !Array.isArray(storedWords) || storedWords.length < 3 || storedWords.length > 5) {
        router.replace("/");
        return;
      }
      if (!storedChoice || !storedChoice.phrase || !storedChoice.category) {
        router.replace("/screen");
        return;
      }

      setChoice(storedChoice);
      const excl = getOrInitExcluded(storedChoice);
      setUserExcluded(excl.userExcluded || []);
      setSeen(excl.seen || []);

      void fetchExplore(storedChoice, excl.userExcluded || [], excl.seen || [], false);
    }, 0);
    return () => clearTimeout(timer);
  }, [router, getOrInitExcluded, fetchExplore]);

  const handleExcludeCard = (record: ExploreRecord) => {
    if (!choice || !exploreData) return;
    const norm = normalizeTitle(record.title || "");
    const canonical = refCanonicalKeys(record);
    const addedTokens = [norm, ...canonical].filter(Boolean);
    const nextExcluded = Array.from(new Set([...userExcluded, ...addedTokens]));
    const nextSeen = Array.from(new Set([...seen, ...addedTokens]));

    setUserExcluded(nextExcluded);
    setSeen(nextSeen);

    // Save updated exclusion state
    sset(KEYS.excluded, {
      phrase: choice.phrase,
      category: choice.category,
      userExcluded: nextExcluded,
      seen: nextSeen
    });

    // Remove the card immediately from local view
    const filteredRecords = exploreData.records.filter(r => {
      const rNorm = normalizeTitle(r.title || "");
      if (rNorm && rNorm === norm) return false;
      const rKeys = refCanonicalKeys(r);
      return !rKeys.some(k => addedTokens.includes(k));
    });

    const updatedData: ExploreResponse = {
      ...exploreData,
      records: filteredRecords,
      corpusStats: {
        ...exploreData.corpusStats,
        returned: filteredRecords.length,
        blocked: (exploreData.corpusStats.blocked || 0) + 1
      }
    };
    setExploreData(updatedData);
    sset(KEYS.explore, {
      ...updatedData,
      phrase: choice.phrase,
      category: choice.category,
      specialty: activeSpecialty
    });
  };

  const handleReRun = () => {
    if (!choice) return;
    void fetchExplore(choice, userExcluded, seen, true);
  };

  const handleReset = () => {
    if (!choice) return;
    const freshSeen: string[] = [];
    setSeen(freshSeen);
    sset(KEYS.excluded, {
      phrase: choice.phrase,
      category: choice.category,
      userExcluded,
      seen: freshSeen
    });
    sessionStorage.removeItem(KEYS.explore);
    void fetchExplore(choice, userExcluded, freshSeen, true);
  };

  if (!choice) {
    return (
      <div className="wrap">
        <header className="hdr">
          <div className="hdr-inner">
            <div className="hdr-left">
              <span className="title-main">
                AIMed <span className="version-badge">v4.2.0</span>
              </span>
            </div>
            <div className="hdr-center">
              <h1>Step 3 · Evidence Explorer</h1>
              <p>Explore literature records ranked by relevance for your selected PICO phrase</p>
            </div>
            <AuthorHeaderRight />
          </div>
        </header>
        <WorkflowStepper currentStep={3} />
        <main id="main" className="solo">
          <section className="card">
            <p className="hint">Loading evidence explorer…</p>
          </section>
        </main>
        <AppFooter stepText="Step 3 Evidence Explorer" />
      </div>
    );
  }

  const meta = CATEGORY_META[choice.category] || CATEGORY_META.established;
  const records = exploreData?.records || [];
  const isExhausted = exploreData && records.length === 0 && !exploreData.hasMore && (userExcluded.length > 0 || seen.length > 0);
  const isEmptyCorpus = exploreData && records.length === 0 && !isExhausted;

  return (
    <div className="wrap">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-left">
            <span className="title-main">
              AIMed <span className="version-badge">v4.2.0</span>
            </span>
          </div>
          <div className="hdr-center">
            <h1>Step 3 · Evidence Explorer</h1>
            <p>Explore literature records ranked by relevance for your selected PICO phrase</p>
          </div>
          <AuthorHeaderRight />
        </div>
      </header>

      <WorkflowStepper currentStep={3} />

      <main id="main" className="solo">
        {/* Persistent Draft Notice Banner */}
        <div style={{
          background: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: "0.85rem",
          color: "#92400e",
          lineHeight: 1.45
        }}>
          ⚠️ <strong>Automated draft.</strong> {DRAFT_DISCLAIMER.replace(/^Automated draft\.\s*/i, "")}
        </div>
        {/* Selection Summary Card */}
        <section className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="specialty-active-badge">
                {currentSpecialty.icon} {currentSpecialty.label}
              </span>
              <span
                className="pill"
                style={{
                  background: meta.badgeBg,
                  color: meta.badgeColor,
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  padding: "4px 12px"
                }}
              >
                {meta.label}
              </span>
            </div>
            {userExcluded.length > 0 && (
              <span className="pill" style={{ background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}>
                Excluded papers: {userExcluded.length}
              </span>
            )}
          </div>
          <div
            style={{
              padding: "12px 16px",
              borderLeft: `4px solid ${meta.borderColor}`,
              backgroundColor: "#f8fafc",
              borderRadius: "0 8px 8px 0"
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem", color: "#0f172a", lineHeight: 1.45 }}>
              {choice.phrase}
            </p>
          </div>
        </section>

        {/* Loading state with Shimmer Skeletons */}
        {loading && (
          <section className="card">
            <AnimatedProcessingIndicator
              message="Exploring multi-source evidence related to your selection…"
              secondaryMessage="PubMed · Europe PMC · Cochrane CENTRAL · OpenAlex · CrossRef · Semantic Scholar"
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div className="skeleton-box" style={{ height: 24, width: "20%" }} />
                    <div className="skeleton-box" style={{ height: 24, width: "30px" }} />
                  </div>
                  <div className="skeleton-box" style={{ height: 20, width: i % 2 === 0 ? "85%" : "92%", marginBottom: 8 }} />
                  <div className="skeleton-box" style={{ height: 14, width: "60%", marginBottom: 8 }} />
                  <div className="skeleton-box" style={{ height: 14, width: "40%" }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Error State */}
        {error && !loading && (
          <section className="card">
            <div className="advisory" style={{ borderColor: "#fca5a5", background: "#fef2f2", color: "#991b1b" }}>
              ⚠️ {error}
            </div>
            <div className="row" style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button type="button" className="primary" onClick={handleReRun}>
                🔄 Try again
              </button>
              <button type="button" className="secondary" onClick={() => router.push("/screen")}>
                ← Back to Step 2
              </button>
            </div>
          </section>
        )}

        {/* Empty Corpus State */}
        {isEmptyCorpus && !loading && !error && (
          <section className="card">
            <div className="empty-state" role="alert" aria-live="polite">
              <p className="empty-title">No direct literature records found</p>
              <p className="hint">Try relaxing or re-running search across clinical sources.</p>
            </div>
            <div className="row" style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button type="button" className="secondary" onClick={handleReRun}>
                🔄 Refresh exploration
              </button>
              <button type="button" className="primary" onClick={() => router.push("/screen")}>
                ← Revise your selection
              </button>
            </div>
          </section>
        )}

        {/* Exhausted State */}
        {isExhausted && !loading && !error && (
          <section className="card">
            <div className="advisory" style={{ marginBottom: 16 }}>
              ℹ️ No further un-seen records related to this selection were found — excluded and seen papers stay filtered.
            </div>
            <div className="row" style={{ display: "flex", gap: 12 }}>
              <button type="button" className="primary" onClick={handleReset}>
                ↺ Reset exploration
              </button>
              <button type="button" className="secondary" onClick={() => router.push("/screen")}>
                ← Revise your selection
              </button>
            </div>
          </section>
        )}

        {/* Results List */}
        {!loading && !error && records.length > 0 && (
          <section className="card">
            {/* Control Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="pill" style={{ fontWeight: 600 }}>
                  Showing {records.length} papers
                </span>
                {exploreData && (
                  <span className="pill" style={{ background: "#f1f5f9", color: "#475569" }}>
                    Screened {exploreData.corpusStats.screened} (Blocked: {exploreData.corpusStats.blocked}) · Relaxation: {exploreData.corpusStats.relaxationLevel}
                  </span>
                )}
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", display: "flex" }}>
                <button
                  type="button"
                  className="primary"
                  onClick={handleReRun}
                  title="Fetch new papers excluding seen and excluded ones"
                >
                  🔄 Re-run search
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={handleReset}
                  title="Clear seen papers and restart exploration"
                >
                  ↺ Reset search
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => router.push("/summary")}
                  title="Proceed to Step 4: Workflow summary"
                >
                  Next: Workflow summary →
                </button>
              </div>
            </div>

            {/* Source Status Chips */}
            {exploreData?.sources && exploreData.sources.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e2e8f0" }}>
                {exploreData.sources.map(src => (
                  <span
                    key={src.id}
                    className={`source-badge-mini source-badge-${src.id.toLowerCase().replace(/[^a-z0-9]/g, "")}`}
                    style={{
                      opacity: src.ok ? 1 : 0.6,
                      borderStyle: src.ok ? "solid" : "dashed"
                    }}
                  >
                    {src.ok ? "●" : "○"} {formatSourceName(src.id)}: {src.count}
                  </span>
                ))}
              </div>
            )}

            {/* Ranked Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {records.map((r, i) => {
                const elementsMatchedText = (r.matchedElements || [])
                  .map(code => ELEMENT_LABELS[code] || code)
                  .join(", ");
                const matchSummary = elementsMatchedText ? `Matches: ${elementsMatchedText}` : "Broad clinical context match";

                return (
                  <div
                    key={r.pmid || r.doi || `r-${i}`}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: "16px 18px",
                      background: "#ffffff",
                      position: "relative",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                          className="pill"
                          style={{
                            background: r.relevancePct >= 70 ? "#ecfdf5" : r.relevancePct >= 40 ? "#eff6ff" : "#f8fafc",
                            color: r.relevancePct >= 70 ? "#065f46" : r.relevancePct >= 40 ? "#1e40af" : "#475569",
                            fontWeight: 700,
                            fontSize: "0.92rem",
                            padding: "4px 10px"
                          }}
                        >
                          {r.relevancePct}% related
                        </span>
                        {r.design && r.design !== "unclassified" && (
                          <span className="pill" style={{ background: "#f0fdf4", color: "#166534", fontSize: "0.78rem", fontWeight: 600 }}>
                            {r.design}
                          </span>
                        )}
                        {r.year && (
                          <span className="pill" style={{ background: "#f1f5f9", color: "#475569", fontSize: "0.82rem" }}>
                            {r.year}
                          </span>
                        )}
                        {r.source && (
                          <span
                            className={`source-badge-mini source-badge-${r.source.toLowerCase().replace(/[^a-z0-9]/g, "")}`}
                          >
                            {r.source}
                          </span>
                        )}
                        {r.lowMetadata && (
                          <span className="pill" style={{ background: "#fff7ed", color: "#c2410c", fontSize: "0.74rem" }}>
                            low metadata
                          </span>
                        )}
                      </div>

                      {/* Exclude button */}
                      <button
                        type="button"
                        onClick={() => handleExcludeCard(r)}
                        aria-label={`Exclude paper: ${r.title}`}
                        className="secondary"
                        style={{
                          fontSize: "0.78rem",
                          padding: "3px 8px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4
                        }}
                        title="Exclude paper from exploration"
                      >
                        <span>×</span> Exclude
                      </button>
                    </div>

                    {/* Paper Title (strictly without hyperlinks) */}
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "6px 0 8px 0", color: "#0f172a", lineHeight: 1.4 }}>
                      {r.title}
                    </h3>

                    {/* Authors and Journal */}
                    <p style={{ margin: "0 0 8px 0", fontSize: "0.86rem", color: "#475569", lineHeight: 1.4 }}>
                      {r.authors ? `${r.authors}. ` : ""}
                      {r.journal ? <em>{r.journal}</em> : ""}
                      {r.pmid ? ` (PMID: ${r.pmid})` : r.doi ? ` (DOI: ${r.doi})` : ""}
                    </p>

                    {/* Matched Elements basis */}
                    <div style={{ fontSize: "0.82rem", color: "#0d9488", fontWeight: 600 }}>
                      ✓ {matchSummary}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => router.push("/screen")}
                >
                  ← Back to Step 2
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    resetSession();
                    router.replace("/");
                  }}
                >
                  Start over
                </button>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => router.push("/summary")}
                title="Proceed to Step 4: Workflow summary"
              >
                Next: Workflow summary →
              </button>
            </div>
          </section>
        )}
      </main>

      <AppFooter stepText="Step 3 Evidence Explorer" />
    </div>
  );
}
