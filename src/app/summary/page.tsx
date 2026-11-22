"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { sget, sset, resetSession, KEYS } from "@/lib/session";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import type { PicoWord } from "@/lib/pico-roles";
import type { ScreenPayload } from "@/lib/deterministic-screen";
import type { ExcludedState } from "@/lib/session";
import type { CitationStyle } from "@/lib/citation-styles";
import { CITATION_STYLE_OPTIONS } from "@/lib/citation-styles";
import { getSpecialtyDefinition } from "@/lib/specialties";
import {
  composeManuscript,
  type ManuscriptData
} from "@/lib/manuscript-composer";
import {
  buildSummaryPayload,
  type ExploreSnapshot,
  type ChoiceState
} from "@/lib/summary-payload";
import { DRAFT_DISCLAIMER, APP_VERSION } from "@/lib/version";
import { AppFooter } from "@/components/AppFooter";
import { AuthorHeaderRight } from "@/components/AuthorHeaderRight";

const CATEGORY_META = {
  established: {
    label: "Established knowledge",
    icon: "✅",
    borderColor: "#10b981",
    badgeBg: "#ecfdf5",
    badgeColor: "#047857"
  },
  conflicting: {
    label: "Conflicting evidence",
    icon: "⚖️",
    borderColor: "#f59e0b",
    badgeBg: "#fffbeb",
    badgeColor: "#b45309"
  },
  gap: {
    label: "Literature gap",
    icon: "🔍",
    borderColor: "#8b5cf6",
    badgeBg: "#f5f3ff",
    badgeColor: "#6d28d9"
  }
};

const ROLE_CONFIG: Record<string, { label: string; badge: string; bg: string; border: string; text: string; badgeBg: string }> = {
  population: {
    label: "Population (P)",
    badge: "P",
    bg: "#eff6ff",
    border: "#bfdbfe",
    text: "#1d4ed8",
    badgeBg: "#2563eb"
  },
  intervention: {
    label: "Intervention (I)",
    badge: "I",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    text: "#15803d",
    badgeBg: "#16a34a"
  },
  comparator: {
    label: "Comparator (C)",
    badge: "C",
    bg: "#fefce8",
    border: "#fef08a",
    text: "#a16207",
    badgeBg: "#ca8a04"
  },
  outcome: {
    label: "Outcome (O)",
    badge: "O",
    bg: "#faf5ff",
    border: "#e9d5ff",
    text: "#7e22ce",
    badgeBg: "#9333ea"
  }
};

function renderFormattedParagraph(para: string, style: CitationStyle) {
  if (style !== "vancouver") {
    return para;
  }
  const parts = para.split(/(\[[\d\s,\-]+\])/);
  if (parts.length === 1) return para;
  return parts.map((part, idx) => {
    if (/^\[([\d\s,\-]+)\]$/.test(part)) {
      return (
        <sup
          key={idx}
          style={{
            color: "#0f766e",
            fontWeight: 700,
            fontSize: "0.78em",
            padding: "0 1px"
          }}
        >
          {part}
        </sup>
      );
    }
    return part;
  });
}

export default function SummaryPage() {
  const router = useRouter();
  const [words, setWords] = useState<PicoWord[] | null>(null);
  const [choice, setChoice] = useState<ChoiceState | null>(null);
  const [specialty, setSpecialty] = useState<string>("obgyn");
  const [screenSnapshot, setScreenSnapshot] = useState<ScreenPayload | null>(null);
  const [exploreSnapshot, setExploreSnapshot] = useState<ExploreSnapshot | null>(null);
  const [excludedState, setExcludedState] = useState<ExcludedState | null>(null);

  const [style, setStyle] = useState<CitationStyle>("vancouver");
  const [aiManuscript, setAiManuscript] = useState<ManuscriptData | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichNotice, setEnrichNotice] = useState<string | null>(null);

  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const rawWords = sget<PicoWord[]>(KEYS.picoWords);
      if (!rawWords || !Array.isArray(rawWords) || rawWords.length < 3) {
        router.replace("/dashboard");
        return;
      }

      const rawChoice = sget<ChoiceState>(KEYS.choice);
      if (!rawChoice || !rawChoice.phrase || !rawChoice.category) {
        router.replace("/screen");
        return;
      }

      const savedSpec = sget<string>(KEYS.specialty) || "obgyn";
      setSpecialty(savedSpec);

      const savedStyle = sget<CitationStyle>(KEYS.style) || "vancouver";
      setStyle(savedStyle);

      setWords(rawWords);
      setChoice(rawChoice);
      setScreenSnapshot(sget<ScreenPayload>(KEYS.screen));
      setExploreSnapshot(sget<ExploreSnapshot>(KEYS.explore));
      setExcludedState(sget<ExcludedState>(KEYS.excluded));
    }, 0);
    return () => clearTimeout(timer);
  }, [router]);

  // Derive deterministic manuscript directly via useMemo without cascading effects
  const deterministicManuscript = useMemo(() => {
    if (!words || !choice) return null;
    const stats = {
      retrieved: exploreSnapshot?.corpusStats?.retrieved ?? screenSnapshot?.corpusStats?.retrieved ?? 0,
      screened: exploreSnapshot?.corpusStats?.screened ?? screenSnapshot?.corpusStats?.screened ?? 0,
      relaxationLevel: exploreSnapshot?.corpusStats?.relaxationLevel ?? screenSnapshot?.corpusStats?.relaxationLevel ?? 0,
      excludedCount: excludedState?.userExcluded?.length ?? 0
    };
    return composeManuscript({
      words,
      category: choice.category,
      phrase: choice.phrase,
      screeningStats: stats,
      records: exploreSnapshot?.records || [],
      userExcluded: excludedState?.userExcluded || [],
      searchLog: exploreSnapshot?.searchLog,
      specialty,
      style
    });
  }, [words, choice, specialty, screenSnapshot, exploreSnapshot, excludedState, style]);

  const manuscript = aiManuscript && aiManuscript.citationStyle === style
    ? aiManuscript
    : deterministicManuscript;

  const handleStyleChange = (newStyle: CitationStyle) => {
    if (newStyle === style) return;
    setStyle(newStyle);
    sset(KEYS.style, newStyle);
    setEnrichNotice(null);
  };

  const handleAiEnrich = async () => {
    if (!words || !choice || enriching) return;
    setEnriching(true);
    setEnrichNotice(null);

    try {
      const stats = {
        retrieved: exploreSnapshot?.corpusStats?.retrieved ?? screenSnapshot?.corpusStats?.retrieved ?? 0,
        screened: exploreSnapshot?.corpusStats?.screened ?? screenSnapshot?.corpusStats?.screened ?? 0,
        relaxationLevel: exploreSnapshot?.corpusStats?.relaxationLevel ?? screenSnapshot?.corpusStats?.relaxationLevel ?? 0,
        excludedCount: excludedState?.userExcluded?.length ?? 0
      };

      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "compose",
          specialty,
          words,
          choice,
          screeningStats: stats,
          records: exploreSnapshot?.records || [],
          userExcluded: excludedState?.userExcluded || [],
          searchLog: exploreSnapshot?.searchLog,
          style
        })
      });

      if (!res.ok) {
        throw new Error(`Enrichment service responded with status ${res.status}`);
      }

      const data = (await res.json()) as ManuscriptData;
      if (data && data.sections) {
        setAiManuscript(data);
        if (data.aiEnriched) {
          setEnrichNotice("✨ Narrative prose successfully enriched by scientific editor model.");
        } else {
          setEnrichNotice("Deterministic draft preserved (enrichment unavailable or rejected by verification gates).");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI enrichment service unavailable.";
      setEnrichNotice(`⚠️ AI enrichment notice: ${msg}. Retained verified deterministic draft.`);
    } finally {
      setEnriching(false);
    }
  };

  const summaryData = useMemo(() => {
    if (!words || !choice) return null;
    return buildSummaryPayload(words, choice, screenSnapshot, exploreSnapshot, excludedState, manuscript, specialty);
  }, [words, choice, screenSnapshot, exploreSnapshot, excludedState, manuscript, specialty]);

  const handleStartOver = () => {
    resetSession();
    router.push("/");
  };

  if (!words || !choice || !summaryData || !manuscript) {
    return (
      <div className="wrap">
        <header className="hdr">
          <div className="hdr-inner">
            <div className="hdr-left">
              <span className="title-main">
                AIMed <span className="version-badge">v{APP_VERSION}</span>
              </span>
            </div>
            <div className="hdr-center">
              <h1>🧾 Step 4 · Scientific Manuscript</h1>
              <p>Publication-grade narrative evidence synthesis draft with multi-style citations</p>
            </div>
            <AuthorHeaderRight />
          </div>
        </header>
        <WorkflowStepper currentStep={4} />
        <main id="main" className="solo">
          <section className="card">
            <p className="hint">Loading manuscript draft…</p>
          </section>
        </main>
        <AppFooter stepText="Step 4 Manuscript Summary" />
      </div>
    );
  }

  const meta = CATEGORY_META[choice.category] || CATEGORY_META.established;
  const papers = summaryData.papers;
  const excludedCount = excludedState?.userExcluded?.length ?? 0;

  const hasScreenStats = !!(screenSnapshot?.corpusStats || exploreSnapshot?.corpusStats);
  const retrievedDisplay = hasScreenStats ? String(summaryData.screeningStats.retrieved) : "0";
  const screenedDisplay = hasScreenStats ? String(summaryData.screeningStats.screened) : "0";

  let specialtyLabel = specialty;
  try {
    const specDef = getSpecialtyDefinition(specialty);
    if (specDef) specialtyLabel = specDef.label;
  } catch {}

  const handleExport = async (format: "pdf" | "docx") => {
    if (papers.length === 0 && (!manuscript.sections || manuscript.sections.length === 0)) return;
    setExporting(format);
    setExportError(null);

    try {
      const endpoint = format === "pdf" ? "/api/pdf" : "/api/docx";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: choice.phrase,
          workflow: summaryData
        })
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null as { error?: string } | null);
        throw new Error(errorBody?.error || `Export failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aimed-evidence-summary-${style}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Document export failed. Please try again.";
      setExportError(msg);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="wrap">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-left">
            <span className="title-main">
              AIMed <span className="version-badge">v{APP_VERSION}</span>
            </span>
          </div>
          <div className="hdr-center">
            <h1>🧾 Step 4 · Scientific Manuscript</h1>
            <p>Publication-grade narrative evidence synthesis draft with multi-style citations</p>
          </div>
          <AuthorHeaderRight />
        </div>
      </header>

      <WorkflowStepper currentStep={4} />

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

        {/* Compact Workflow Summary Strip */}
        <section className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              🔍 Workflow Context Snapshot
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span
                className="pill"
                style={{
                  background: "#f0fdfa",
                  color: "#0f766e",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  border: "1px solid #99f6e4",
                  padding: "3px 8px"
                }}
              >
                🩺 {specialtyLabel}
              </span>
              <span
                className="pill"
                style={{
                  background: meta.badgeBg,
                  color: meta.badgeColor,
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  padding: "3px 8px"
                }}
              >
                {meta.icon} {meta.label}
              </span>
            </div>
          </div>

          {/* PICO Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {words.map((w, idx) => {
              const conf = ROLE_CONFIG[w.role] || ROLE_CONFIG.population;
              return (
                <div
                  key={`${w.word}-${idx}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: conf.bg,
                    border: `1px solid ${conf.border}`,
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: "0.82rem"
                  }}
                >
                  <span
                    style={{
                      background: conf.badgeBg,
                      color: "#fff",
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: 3
                    }}
                  >
                    {conf.badge}
                  </span>
                  <span style={{ color: conf.text, fontWeight: 600 }}>{w.word}</span>
                </div>
              );
            })}
          </div>

          {/* Chosen Phrase */}
          <div
            style={{
              padding: "8px 12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              fontSize: "0.88rem",
              fontWeight: 600,
              color: "#1e293b",
              marginBottom: 8
            }}
          >
            {choice.phrase}
          </div>

          {/* Screening & Exclusion Stats Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              fontSize: "0.8rem",
              color: "#64748b",
              borderTop: "1px solid #f1f5f9",
              paddingTop: 8
            }}
          >
            <div>
              <span>📊 Retrieved: <strong>{retrievedDisplay}</strong></span>
              <span style={{ margin: "0 6px" }}>·</span>
              <span>Screened: <strong>{screenedDisplay}</strong></span>
              <span style={{ margin: "0 6px" }}>·</span>
              <span>Excluded: <strong>{excludedCount}</strong></span>
              <span style={{ margin: "0 6px" }}>·</span>
              <span>Prioritized: <strong>{papers.length}</strong></span>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={handleStartOver}
              style={{ fontSize: "0.78rem", padding: "4px 10px" }}
              title="Reset workflow state and return to Step 1"
            >
              ↺ Start over
            </button>
          </div>
        </section>

        {/* Action Controls & Citation Style Selector Bar */}
        <section className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>
                Citation style:
              </span>
              <div style={{ display: "inline-flex", gap: 4, background: "#f1f5f9", padding: 3, borderRadius: 6 }}>
                {CITATION_STYLE_OPTIONS.map(opt => {
                  const isActive = style === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleStyleChange(opt.id)}
                      style={{
                        border: "none",
                        background: isActive ? "#0f766e" : "transparent",
                        color: isActive ? "#ffffff" : "#475569",
                        fontWeight: isActive ? 700 : 500,
                        fontSize: "0.8rem",
                        padding: "4px 10px",
                        borderRadius: 4,
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {opt.id.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary"
                onClick={handleAiEnrich}
                disabled={enriching}
                style={{ fontSize: "0.84rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                title="Run single-pass scientific editor enhancement on narrative flow"
              >
                {enriching ? "Enriching narrative…" : "✨ Enrich narrative (AI)"}
              </button>

              <button
                type="button"
                className="primary"
                onClick={() => handleExport("docx")}
                disabled={exporting !== null}
                style={{ fontSize: "0.84rem" }}
              >
                {exporting === "docx" ? "Building DOCX…" : "Download DOCX"}
              </button>

              <button
                type="button"
                className="primary"
                onClick={() => handleExport("pdf")}
                disabled={exporting !== null}
                style={{ fontSize: "0.84rem" }}
              >
                {exporting === "pdf" ? "Building PDF…" : "Download PDF"}
              </button>
            </div>
          </div>

          {enrichNotice && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: "0.82rem",
                background: enrichNotice.startsWith("✨") ? "#f0fdf4" : "#fefce8",
                border: `1px solid ${enrichNotice.startsWith("✨") ? "#bbf7d0" : "#fef08a"}`,
                color: enrichNotice.startsWith("✨") ? "#15803d" : "#a16207"
              }}
            >
              {enrichNotice}
            </div>
          )}

          {exportError && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: "0.82rem",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c"
              }}
            >
              {exportError}
            </div>
          )}
        </section>

        {/* Manuscript Document View */}
        <article
          className="card"
          style={{
            background: "#ffffff",
            padding: "24px 28px",
            lineHeight: 1.6,
            color: "#1e293b",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
          }}
        >
          {/* Header Title with AI Enriched Badge */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <h2
                style={{
                  fontSize: "1.35rem",
                  fontWeight: 800,
                  color: "#0f172a",
                  lineHeight: 1.35,
                  margin: 0,
                  flex: 1
                }}
              >
                {manuscript.title}
              </h2>
              {manuscript.aiEnriched && (
                <span
                  style={{
                    background: "#ecfdf5",
                    color: "#047857",
                    border: "1px solid #a7f3d0",
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    padding: "2px 8px",
                    borderRadius: 12
                  }}
                >
                  ✨ AI enriched
                </span>
              )}
            </div>
          </div>

          {/* Abstract Block */}
          {manuscript.abstract && manuscript.abstract.length > 0 && (
            <div
              style={{
                background: "#f8fafc",
                borderLeft: "4px solid #0f766e",
                padding: "14px 18px",
                marginBottom: 24,
                borderRadius: "0 6px 6px 0"
              }}
            >
              <h3
                style={{
                  fontSize: "0.98rem",
                  fontWeight: 800,
                  color: "#0f766e",
                  margin: "0 0 8px 0",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em"
                }}
              >
                Abstract
              </h3>
              {manuscript.abstract.map((sentence, idx) => (
                <p key={idx} style={{ fontSize: "0.92rem", margin: "4px 0", color: "#334155" }}>
                  {sentence}
                </p>
              ))}
            </div>
          )}

          {/* Manuscript Narrative Sections */}
          {manuscript.sections && manuscript.sections.map((section, secIdx) => (
            <section key={secIdx} style={{ marginBottom: 22 }}>
              <h3
                style={{
                  fontSize: "1.08rem",
                  fontWeight: 700,
                  color: "#0f766e",
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: 4,
                  margin: "0 0 10px 0"
                }}
              >
                {section.heading}
              </h3>
              {section.paragraphs.map((para, pIdx) => {
                const trimmed = para.trim();
                if (trimmed.startsWith("|") && trimmed.includes("\n|")) {
                  const lines = trimmed.split("\n").map(l => l.trim()).filter(l => l.startsWith("|") && l.endsWith("|"));
                  if (lines.length >= 2) {
                    const headerLine = lines[0];
                    const dataLines = lines.slice(1).filter(l => !/^[|\s:-]+$/.test(l));
                    const headers = headerLine.slice(1, -1).split("|").map(c => c.trim());
                    const rows = dataLines.map(l => l.slice(1, -1).split("|").map(c => c.trim()));
                    return (
                      <div key={pIdx} style={{ overflowX: "auto", margin: "14px 0" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", border: "1px solid #e2e8f0" }}>
                          <thead>
                            <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                              {headers.map((h, i) => (
                                <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#1e293b", borderRight: "1px solid #e2e8f0" }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, rIdx) => (
                              <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} style={{ padding: "8px 12px", color: "#334155", borderRight: "1px solid #e2e8f0" }}>
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }
                }
                return (
                  <p key={pIdx} style={{ fontSize: "0.93rem", margin: "0 0 10px 0", color: "#334155", lineHeight: 1.6 }}>
                    {renderFormattedParagraph(para, style)}
                  </p>
                );
              })}
            </section>
          ))}

          {/* References Section */}
          <section style={{ marginTop: 28, paddingTop: 16, borderTop: "2px solid #e2e8f0" }}>
            <h3
              style={{
                fontSize: "1.08rem",
                fontWeight: 700,
                color: "#0f766e",
                margin: "0 0 12px 0",
                textTransform: "uppercase"
              }}
            >
              REFERENCES ({style.toUpperCase()})
            </h3>
            {manuscript.references && manuscript.references.length > 0 ? (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: "none"
                }}
              >
                {manuscript.references.map((ref, idx) => (
                  <li
                    key={idx}
                    style={{
                      fontSize: "0.85rem",
                      color: "#334155",
                      marginBottom: 8,
                      lineHeight: 1.45
                    }}
                  >
                    {ref}
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: "0.88rem", color: "#94a3b8", fontStyle: "italic" }}>
                No references retained for synthesis.
              </p>
            )}
          </section>
        </article>
      </main>

      <AppFooter stepText="Step 4 Manuscript Summary" />
    </div>
  );
}
