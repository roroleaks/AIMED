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
import { DRAFT_DISCLAIMER } from "@/lib/version";
import { getSourceLabel } from "@/lib/literature-sources";
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
            color: "var(--accent)",
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

function ExtractionTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggleRow = (idx: number) => {
    setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div style={{ margin: "var(--space-4) 0" }}>
      {/* Desktop & Tablet Table */}
      <div className="extraction-table-wrapper" style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-body-sm)" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--canvas)", borderBottom: "2px solid var(--border-strong)" }}>
              {headers.map((h, i) => {
                let width = "auto";
                if (i === 0) width = "12%";
                else if (i === 1) width = "15%";
                else if (i === 2) width = "15%";
                else if (i === 3) width = "15%";
                else if (i === 4) width = "43%";
                return (
                  <th
                    key={i}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "var(--ink)",
                      borderRight: "1px solid var(--border)",
                      position: "sticky",
                      top: 0,
                      background: "var(--canvas)",
                      zIndex: 1,
                      width
                    }}
                  >
                    {h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const isExp = Boolean(expanded[rIdx]);
              return (
                <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? "var(--surface)" : "var(--canvas)", borderBottom: "1px solid var(--border)" }}>
                  {row.map((cell, cIdx) => {
                    const isFinding = cIdx === 4 || cIdx === row.length - 1;
                    const isLong = cell.length > 90;
                    return (
                      <td
                        key={cIdx}
                        style={{
                          padding: "var(--space-2) var(--space-3)",
                          color: "var(--ink-2)",
                          borderRight: "1px solid var(--border)",
                          verticalAlign: "top"
                        }}
                      >
                        <div
                          style={
                            isFinding && isLong && !isExp
                              ? {
                                  display: "-webkit-box",
                                  WebkitLineClamp: 4,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden"
                                }
                              : undefined
                          }
                        >
                          {cell}
                        </div>
                        {isFinding && isLong && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => toggleRow(rIdx)}
                            style={{
                              padding: 0,
                              height: "auto",
                              fontSize: "var(--fs-caption)",
                              color: "var(--accent)",
                              marginTop: "var(--space-1)"
                            }}
                          >
                            {isExp ? "Show less" : "Show more"}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (<640px) */}
      <div className="extraction-table-cards">
        {rows.map((row, rIdx) => (
          <div key={rIdx} className="card extraction-card" style={{ marginBottom: "var(--space-3)", padding: "var(--space-3)" }}>
            <div style={{ fontWeight: 700, fontSize: "var(--fs-body)", color: "var(--ink)", marginBottom: "var(--space-1)" }}>
              {row[0]}
            </div>
            {headers.slice(1).map((h, hIdx) => {
              const val = row[hIdx + 1];
              if (!val) return null;
              return (
                <div key={hIdx} style={{ fontSize: "var(--fs-caption)", marginTop: "var(--space-1)" }}>
                  <strong style={{ color: "var(--muted)" }}>{h}: </strong>
                  <span style={{ color: "var(--ink-2)" }}>{val}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormattedMethodsParagraph({ para }: { para: string }) {
  if (!para.includes("Exact queries executed: ")) {
    return <>{para}</>;
  }

  const [lead, queryLog] = para.split("Exact queries executed: ");
  const queryEntries = queryLog
    ? queryLog.split("; ").map(item => {
        const m = item.match(/^([^:]+):\s*"([^"]+)"\s*\(([^)]+)\)/);
        if (m) {
          return { source: m[1], query: m[2], hits: m[3] };
        }
        return { source: item, query: "", hits: "" };
      })
    : [];

  return (
    <>
      <span>{lead}</span>
      <details
        style={{
          marginTop: "var(--space-2)",
          marginBottom: "var(--space-3)",
          padding: "var(--space-2) var(--space-3)",
          background: "var(--canvas)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)"
        }}
      >
        <summary
          style={{
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "var(--fs-caption)",
            color: "var(--accent)"
          }}
        >
          🔍 View executed search queries ({queryEntries.length} sources)
        </summary>
        <div style={{ marginTop: "var(--space-2)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-caption)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)", textAlign: "left" }}>
                <th style={{ padding: "var(--space-1) var(--space-2)" }}>Source</th>
                <th style={{ padding: "var(--space-1) var(--space-2)" }}>Query</th>
                <th style={{ padding: "var(--space-1) var(--space-2)" }}>Hits</th>
              </tr>
            </thead>
            <tbody>
              {queryEntries.map((q, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "var(--space-1) var(--space-2)", fontWeight: 600, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                    {getSourceLabel(q.source)}
                  </td>
                  <td style={{ padding: "var(--space-1) var(--space-2)", fontFamily: "monospace", fontSize: "var(--fs-badge)", color: "var(--ink-2)" }}>
                    {q.query || q.source}
                  </td>
                  <td style={{ padding: "var(--space-1) var(--space-2)", whiteSpace: "nowrap", color: "var(--muted)" }}>
                    {q.hits}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
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
                AIMed
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
      <header className="hdr hdr--compact">
        <div className="hdr-inner">
          <div className="hdr-left">
            <span className="title-main">AIMed</span>
          </div>
          <div className="hdr-center">
            <h1>Step 4 · Scientific Manuscript</h1>
          </div>
          <AuthorHeaderRight />
        </div>
      </header>

      <WorkflowStepper currentStep={4} />

      <main id="main" className="solo">
        {/* Persistent Draft Notice Banner */}
        <div className="notice notice--warning" style={{ marginBottom: "var(--space-4)" }}>
          <span>⚠️</span>
          <div>
            <strong>Automated draft.</strong> {DRAFT_DISCLAIMER.replace(/^Automated draft\.\s*/i, "")}
          </div>
        </div>

        {/* Compact Workflow Summary Strip */}
        <section className="card" style={{ marginBottom: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)", flexWrap: "wrap", gap: "var(--space-2)" }}>
            <span className="overline" style={{ color: "var(--accent)" }}>
              🔍 Workflow Context Snapshot
            </span>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
              <span
                className="pill"
                style={{
                  background: "var(--accent-subtle)",
                  color: "var(--accent)",
                  fontWeight: 700,
                  fontSize: "var(--fs-caption)",
                  border: "1px solid var(--accent-border)",
                  padding: "var(--space-1) var(--space-2)"
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
                  fontSize: "var(--fs-caption)",
                  padding: "var(--space-1) var(--space-2)"
                }}
              >
                {meta.icon} {meta.label}
              </span>
            </div>
          </div>

          {/* PICO Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            {words.map((w, idx) => {
              const conf = ROLE_CONFIG[w.role] || ROLE_CONFIG.population;
              return (
                <div
                  key={`${w.word}-${idx}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    background: conf.bg,
                    border: `1px solid ${conf.border}`,
                    padding: "var(--space-1) var(--space-2)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--fs-caption)"
                  }}
                >
                  <span
                    style={{
                      background: conf.badgeBg,
                      color: "#fff",
                      fontSize: "var(--fs-badge)",
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: "var(--radius-sm)"
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
              padding: "var(--space-2) var(--space-3)",
              background: "var(--canvas)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--fs-body-sm)",
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: "var(--space-2)"
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
              gap: "var(--space-2)",
              fontSize: "var(--fs-caption)",
              color: "var(--muted)",
              borderTop: "1px solid var(--border)",
              paddingTop: "var(--space-2)"
            }}
          >
            <div>
              <span>📊 Retrieved: <strong>{retrievedDisplay}</strong></span>
              <span style={{ margin: "0 var(--space-1)" }}>·</span>
              <span>Screened: <strong>{screenedDisplay}</strong></span>
              <span style={{ margin: "0 var(--space-1)" }}>·</span>
              <span>Excluded: <strong>{excludedCount}</strong></span>
              <span style={{ margin: "0 var(--space-1)" }}>·</span>
              <span>Prioritized: <strong>{papers.length}</strong></span>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleStartOver}
              style={{ fontSize: "var(--fs-caption)", padding: "var(--space-1) var(--space-2)" }}
              title="Reset workflow state and return to Step 1"
            >
              ↺ Start over
            </button>
          </div>
        </section>

        {/* Sticky Action Controls & Citation Style Selector Bar */}
        <section
          className="card summary-action-bar"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            marginBottom: "var(--space-4)",
            boxShadow: "var(--shadow-1)",
            background: "var(--surface)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--ink-2)" }}>
                Citation style:
              </span>
              <div className="segmented" role="radiogroup" aria-label="Citation style selection">
                {CITATION_STYLE_OPTIONS.map(opt => {
                  const isActive = style === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      className={`segmented-item ${isActive ? "active" : ""}`}
                      onClick={() => handleStyleChange(opt.id)}
                      style={{
                        minHeight: 40,
                        padding: "0 var(--space-3)",
                        fontSize: "var(--fs-caption)",
                        fontWeight: isActive ? 700 : 500
                      }}
                    >
                      {opt.id.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleAiEnrich}
                disabled={enriching}
                title="Run single-pass scientific editor enhancement on narrative flow"
              >
                {enriching ? "Enriching narrative…" : "✨ Enrich narrative (AI)"}
              </button>

              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => handleExport("docx")}
                disabled={exporting !== null}
              >
                {exporting === "docx" ? "Building DOCX…" : "Download DOCX"}
              </button>

              <button
                type="button"
                className="btn btn--primary"
                onClick={() => handleExport("pdf")}
                disabled={exporting !== null}
              >
                {exporting === "pdf" ? "Building PDF…" : "Download PDF"}
              </button>

              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleStartOver}
                title="Reset workflow state and return to Step 1"
              >
                ↺ Start over
              </button>
            </div>
          </div>

          {enrichNotice && (
            <div
              className="notice notice--info"
              style={{
                marginTop: "var(--space-2)",
                fontSize: "var(--fs-caption)"
              }}
            >
              {enrichNotice}
            </div>
          )}

          {exportError && (
            <div
              className="notice notice--warning"
              style={{
                marginTop: "var(--space-2)",
                fontSize: "var(--fs-caption)",
                background: "var(--danger-bg)",
                borderColor: "#fecaca",
                color: "var(--danger)"
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
            background: "var(--surface)",
            padding: "var(--space-5)",
            lineHeight: "var(--lh-reading)",
            color: "var(--ink-2)",
            boxShadow: "var(--shadow-1)"
          }}
        >
          {/* Header Title with AI Enriched Badge */}
          <div style={{ marginBottom: "var(--space-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <h2
                style={{
                  fontSize: "var(--fs-section)",
                  fontWeight: 800,
                  color: "var(--ink)",
                  lineHeight: "var(--lh-heading)",
                  margin: 0,
                  flex: 1
                }}
              >
                {manuscript.title}
              </h2>
              {manuscript.aiEnriched && (
                <span
                  className="badge badge--success"
                  style={{
                    fontWeight: 700,
                    fontSize: "var(--fs-badge)",
                    padding: "2px 8px"
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
                background: "var(--canvas)",
                borderLeft: "4px solid var(--accent)",
                padding: "var(--space-4)",
                marginBottom: "var(--space-5)",
                borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                maxWidth: "var(--reading-max)"
              }}
            >
              <h3
                style={{
                  fontSize: "var(--fs-subsection)",
                  fontWeight: 700,
                  color: "var(--accent)",
                  margin: "0 0 var(--space-2) 0"
                }}
              >
                Abstract
              </h3>
              {manuscript.abstract.map((sentence, idx) => (
                <p key={idx} style={{ fontSize: "var(--fs-body-sm)", margin: "var(--space-1) 0", color: "var(--ink-2)", lineHeight: "var(--lh-reading)" }}>
                  {sentence}
                </p>
              ))}
            </div>
          )}

          {/* Manuscript Narrative Sections */}
          {manuscript.sections && manuscript.sections.map((section, secIdx) => (
            <section key={secIdx} style={{ marginBottom: "var(--space-5)" }}>
              <h3
                style={{
                  fontSize: "var(--fs-subsection)",
                  fontWeight: 700,
                  color: "var(--accent)",
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: "var(--space-1)",
                  margin: "0 0 var(--space-3) 0"
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
                      <ExtractionTable key={pIdx} headers={headers} rows={rows} />
                    );
                  }
                }
                return (
                  <p key={pIdx} style={{ fontSize: "var(--fs-body)", margin: "0 0 var(--space-3) 0", color: "var(--ink-2)", lineHeight: "var(--lh-reading)", maxWidth: "var(--reading-max)" }}>
                    {section.heading.toLowerCase().includes("search") ? (
                      <FormattedMethodsParagraph para={para} />
                    ) : (
                      renderFormattedParagraph(para, style)
                    )}
                  </p>
                );
              })}
            </section>
          ))}

          {/* References Section */}
          <section style={{ marginTop: "var(--space-6)", paddingTop: "var(--space-4)", borderTop: "2px solid var(--border)" }}>
            <h3
              style={{
                fontSize: "var(--fs-section)",
                fontWeight: 700,
                color: "var(--accent)",
                margin: "0 0 var(--space-3) 0"
              }}
            >
              References ({style.toUpperCase()})
            </h3>
            {manuscript.references && manuscript.references.length > 0 ? (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: "none",
                  maxWidth: "var(--reading-max)"
                }}
              >
                {manuscript.references.map((ref, idx) => (
                  <li
                    key={idx}
                    style={{
                      fontSize: "var(--fs-body-sm)",
                      color: "var(--ink-2)",
                      marginBottom: "var(--space-2)",
                      lineHeight: "var(--lh-snug)"
                    }}
                  >
                    {ref}
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: "var(--fs-body-sm)", color: "var(--muted)", fontStyle: "italic" }}>
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
