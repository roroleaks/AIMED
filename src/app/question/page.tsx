"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatedProcessingIndicator } from "@/components/AnimatedProcessingIndicator";
import { KB, type Analysis, type Formulation, type SpecialtyKey } from "@/lib/kb";
import {
  buildOutcomeContext,
  selectOutcomes
} from "@/lib/outcome-selection";
import { sget, sset, KEYS } from "@/lib/session";
import { readSessionInput, sessionSearchText } from "@/lib/clinical-input";
import { extractPicoFromQuestion, type ExtractedPico } from "@/lib/pico-parser";
import {
  classifyPaperType,
  getStudyTypeBadgeStyle,
  type ClinicalStudyType
} from "@/lib/study-design";
import {
  CITATION_STYLE_OPTIONS,
  type CitationStyle
} from "@/lib/citation-styles";
import { DEFAULT_LITERATURE_SOURCES } from "@/lib/literature-sources";

interface RawRef {
  pmid?: string;
  title?: string;
  authors?: string;
  year?: string;
  journal?: string;
  doi?: string;
  url?: string;
  source?: string;
  pubType?: string;
  publicationTypes?: string[];
}

interface GapSnapshot {
  topic?: string;
  specialty?: string;
  known?: Array<{ point?: string; references?: Array<RawRef> }>;
  uncertain?: Array<{ point?: string; references?: Array<RawRef> }>;
  gaps?: Array<{ gap?: string }>;
  suggestedQuestions?: Array<{ question: string; rationale: string }>;
}

export interface SupportingPaper {
  id: string;
  pmid: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi?: string;
  url: string;
  source?: string;
  studyType: ClinicalStudyType;
  evidenceCategory: "established" | "uncertain" | "pico-direct";
  point: string;
}

function getSourceBadge(source?: string, pmid?: string) {
  const s = (source || "").toLowerCase();
  if (s === "openalex" || (pmid && pmid.startsWith("oax:"))) {
    return { label: "OpenAlex", icon: "🟢", className: "source-badge-openalex" };
  }
  if (s === "crossref" || (pmid && pmid.startsWith("cr:"))) {
    return { label: "CrossRef", icon: "🟣", className: "source-badge-crossref" };
  }
  if (s === "semanticscholar" || (pmid && pmid.startsWith("s2:"))) {
    return { label: "Semantic Scholar", icon: "🟠", className: "source-badge-semanticscholar" };
  }
  if (s === "pmc" || (pmid && /^(pmc:|PMC)/.test(pmid))) {
    return { label: "PMC", icon: "🟡", className: "source-badge-pmc" };
  }
  return { label: "PubMed", icon: "🔵", className: "source-badge-pubmed" };
}

interface RenderedOutcome {
  id: string;
  label: string;
  category: string;
  rationale: string;
}

export default function QuestionPage() {
  const router = useRouter();
  const [extractedPico, setExtractedPico] = useState<ExtractedPico | null>(null);
  const [outcomeOptions, setOutcomeOptions] = useState<RenderedOutcome[]>([]);
  const [recommendedId, setRecommendedId] = useState<string>("");
  const [recommendedRationale, setRecommendedRationale] = useState<string>("");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("");
  const [customOutcome, setCustomOutcome] = useState<string>("");
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("vancouver");
  const [supportingPapers, setSupportingPapers] = useState<SupportingPaper[]>([]);
  const [selectedStudyTypeFilter, setSelectedStudyTypeFilter] = useState<string>("all");
  const [busy, setBusy] = useState<"loading" | "formulate" | null>("loading");
  const [notice, setNotice] = useState<string | null>(null);

  const studyTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    supportingPapers.forEach(p => {
      counts[p.studyType] = (counts[p.studyType] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      type: type as ClinicalStudyType,
      count
    }));
  }, [supportingPapers]);

  const filteredPapers = useMemo(() => {
    if (selectedStudyTypeFilter === "all") return supportingPapers;
    return supportingPapers.filter(p => p.studyType === selectedStudyTypeFilter);
  }, [supportingPapers, selectedStudyTypeFilter]);

  const primaryStudyTypes = useMemo(() => {
    if (!supportingPapers.length) return "Clinical Studies";
    const types = Array.from(new Set(supportingPapers.map(p => p.studyType))).slice(0, 2);
    return types.join(" · ");
  }, [supportingPapers]);

  // Collect literature keywords from Step 2 evidence map
  const getLiteratureKeywords = useCallback((): string[] => {
    const gapSnapshot = sget<GapSnapshot>(KEYS.gap);
    const kw: string[] = [];
    if (gapSnapshot) {
      if (gapSnapshot.topic) kw.push(gapSnapshot.topic);
      if (Array.isArray(gapSnapshot.known)) {
        gapSnapshot.known.forEach(k => {
          if (k?.point) kw.push(k.point);
          if (Array.isArray(k?.references)) {
            k.references.forEach(r => { if (r?.title) kw.push(r.title); });
          }
        });
      }
      if (Array.isArray(gapSnapshot.uncertain)) {
        gapSnapshot.uncertain.forEach(u => {
          if (u?.point) kw.push(u.point);
          if (Array.isArray(u?.references)) {
            u.references.forEach(r => { if (r?.title) kw.push(r.title); });
          }
        });
      }
      if (Array.isArray(gapSnapshot.gaps)) {
        gapSnapshot.gaps.forEach(g => { if (g?.gap) kw.push(g.gap); });
      }
    }
    return kw;
  }, []);

  const finishAndGo = useCallback((f: Formulation, chosenOutcome: string) => {
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const normElement = (v: unknown): { label: string; value: string } | null => {
      const o = v as { label?: unknown; value?: unknown };
      if (!o || typeof o !== "object") return null;
      const label = str(o.label) || "Element";
      const value = str(o.value);
      return value ? { label, value } : null;
    };
    const normScore = (v: unknown): { name: string; value: number } | null => {
      const o = v as { name?: unknown; value?: unknown };
      const name = str(o?.name);
      const value = typeof o?.value === "number" ? o.value : Number(str(o.value)) || 0;
      return name ? { name, value } : null;
    };
    const normVariant = (v: unknown): { question: string; rationale: string } | null => {
      const o = v as { question?: unknown; rationale?: unknown };
      const question = str(o?.question);
      return question ? { question, rationale: str(o?.rationale) } : null;
    };
    const normAdvisory = (v: unknown): string => {
      if (typeof v === "string" && v.trim()) return v;
      const o = v as { warning?: unknown; recommendation?: unknown; rationale?: unknown };
      if (o && typeof o === "object") {
        const bits = [
          str(o.warning),
          o.recommendation ? `Recommended: ${str(o.recommendation)}` : "",
          str(o.rationale)
        ].filter(Boolean);
        return bits.join(" ");
      }
      return "";
    };

    f.scores = Array.isArray(f.scores)
      ? f.scores.map(normScore).filter((s): s is { name: string; value: number } => !!s) : [];
    if (!f.scores.length) f.scores = [{ name: "Overall", value: 15 }];
    f.elements = Array.isArray(f.elements)
      ? f.elements.map(normElement).filter((e): e is { label: string; value: string } => !!e) : [];
    f.advisories = Array.isArray(f.advisories)
      ? f.advisories.map(normAdvisory).filter(Boolean) : [];
    f.variants = Array.isArray(f.variants)
      ? f.variants.map(normVariant).filter((v): v is { question: string; rationale: string } => !!v) : [];

    sset(KEYS.formulation, f);
    sset(KEYS.outcomes, [chosenOutcome]);
    sset("cq_outcome", chosenOutcome);
    sset(KEYS.citationStyle, citationStyle);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(KEYS.commentary);
    }
    router.push("/paper");
  }, [router, citationStyle]);

  // Formulate PICO and navigate immediately to Step 4
  const proceedToCommentary = useCallback(async (chosenOutcome: string) => {
    if (!extractedPico || !chosenOutcome) return;
    setBusy("formulate");

    const storedSpec = sget<string>(KEYS.specialty);
    const specKey = (extractedPico.specialty && extractedPico.specialty in KB)
      ? (extractedPico.specialty as SpecialtyKey)
      : (storedSpec && storedSpec in KB)
        ? (storedSpec as SpecialtyKey)
        : "internal_med";
    const a: Analysis = {
      specialty: specKey,
      specialtyLabel: KB[specKey]?.label || "Clinical Medicine",
      condition: extractedPico.condition,
      intervention: extractedPico.intervention,
      comparator: extractedPico.comparator,
      questionType: "Therapy / Prevention",
      framework: "PICO",
      missing: [],
      interpretation: `PICO targeting ${extractedPico.condition} with ${extractedPico.intervention} vs ${extractedPico.comparator}`,
      source: "rules"
    };

    const ans: Record<string, string> = {
      condition: extractedPico.condition,
      intervention: extractedPico.intervention,
      comparator: extractedPico.comparator,
      outcome: chosenOutcome
    };

    const { ruleFormulate } = await import("@/lib/rule-engine");
    let f: Formulation = ruleFormulate(a, ans);

    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "formulate",
          analysis: a,
          answered: ans,
          selectedQuestion: extractedPico.cleanQuestion
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const parsed = await res.json();
        if (parsed && parsed.finalQuestion && !parsed.error) {
          f = parsed;
        }
      }
    } catch {
      // ruleFormulate fallback is already complete and verified
    }

    finishAndGo(f, chosenOutcome);
  }, [extractedPico, finishAndGo]);

  useEffect(() => {
    let isCancelled = false;
    const timer = setTimeout(() => {
      if (isCancelled) return;
      try {
        const question = sget<string>(KEYS.question);
        const gapSnapshot = sget<GapSnapshot>(KEYS.gap);
        const normalized = sget<string>(KEYS.inputText);
        const stored = readSessionInput(sget<unknown>(KEYS.input));
        const storedStyle = sget<CitationStyle>(KEYS.citationStyle);
        if (storedStyle && ["vancouver", "apa", "harvard"].includes(storedStyle)) {
          setCitationStyle(storedStyle);
        }
        const fallbackText = question
          || gapSnapshot?.suggestedQuestions?.[0]?.question
          || normalized
          || (stored ? sessionSearchText(stored) : "");

        if (!fallbackText) {
          router.replace("/");
          return;
        }

        // Extract guaranteed P, I, C, O elements from selected PICO question and evidence map
        const pico = extractPicoFromQuestion(
          fallbackText,
          gapSnapshot?.topic || normalized || "",
          gapSnapshot?.specialty as SpecialtyKey | undefined
        );
        setExtractedPico(pico);

        // Build literature-grounded outcome options
        const literatureKw = getLiteratureKeywords();
        const context = buildOutcomeContext(
          {
            specialty: pico.specialty,
            condition: pico.condition,
            intervention: pico.intervention,
            comparator: pico.comparator,
            questionType: "Therapy / Prevention"
          },
          {},
          {
            originalInput: normalized || gapSnapshot?.topic || fallbackText,
            population: pico.condition,
            keywords: literatureKw
          }
        );

        const selection = selectOutcomes(context);
        let options: RenderedOutcome[] = selection.options.map(o => ({
          id: o.id,
          label: o.label,
          category: o.category,
          rationale: o.rationale
        }));

        // Ensure 4 to 6 options are present
        if (options.length < 4) {
          const ranked = KB[pico.specialty].outcomesRanked;
          for (const r of ranked) {
            if (!options.some(o => o.label.toLowerCase() === r.toLowerCase())) {
              options.push({
                id: r.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                label: r,
                category: "clinical",
                rationale: `Standard outcome for ${KB[pico.specialty].label} clinical questions.`
              });
            }
            if (options.length >= 6) break;
          }
        }
        options = options.slice(0, 6);

        setOutcomeOptions(options);
        setRecommendedId(selection.recommendedOutcome.id);
        setRecommendedRationale(selection.recommendedOutcome.rationale);

        // Pre-select the recommended primary outcome so the clinician can proceed in 1 click
        const initialPick = options.find(o => o.id === selection.recommendedOutcome.id)?.label || options[0]?.label || "";
        setSelectedOutcome(initialPick);

        // Extract literature references and classify their study types
        const papers: SupportingPaper[] = [];
        const seen = new Set<string>();

        if (Array.isArray(gapSnapshot?.known)) {
          gapSnapshot.known.forEach((k, idx) => {
            (k.references || []).forEach(r => {
              const key = r.pmid || r.title || `k-${idx}`;
              if (!seen.has(key) && r.title) {
                seen.add(key);
                papers.push({
                  id: key,
                  pmid: r.pmid || "",
                  title: r.title,
                  authors: r.authors || "",
                  year: r.year || "",
                  journal: r.journal || "",
                  doi: r.doi || "",
                  url: r.url || (r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : ""),
                  source: r.source || "pubmed",
                  studyType: classifyPaperType({
                    title: r.title,
                    journal: r.journal,
                    pubType: r.pubType,
                    publicationTypes: r.publicationTypes
                  }),
                  evidenceCategory: "established",
                  point: k.point || ""
                });
              }
            });
          });
        }

        if (Array.isArray(gapSnapshot?.uncertain)) {
          gapSnapshot.uncertain.forEach((u, idx) => {
            (u.references || []).forEach(r => {
              const key = r.pmid || r.title || `u-${idx}`;
              if (!seen.has(key) && r.title) {
                seen.add(key);
                papers.push({
                  id: key,
                  pmid: r.pmid || "",
                  title: r.title,
                  authors: r.authors || "",
                  year: r.year || "",
                  journal: r.journal || "",
                  doi: r.doi || "",
                  url: r.url || (r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : ""),
                  source: r.source || "pubmed",
                  studyType: classifyPaperType({
                    title: r.title,
                    journal: r.journal,
                    pubType: r.pubType,
                    publicationTypes: r.publicationTypes
                  }),
                  evidenceCategory: "uncertain",
                  point: u.point || ""
                });
              }
            });
          });
        }

        if (papers.length > 0) {
          setSupportingPapers(papers);
        } else {
          // If no papers in gapSnapshot, query multi-source literature to ensure literature presence
          const activeSources = sget<string[]>(KEYS.sources) || DEFAULT_LITERATURE_SOURCES;
          fetch("/api/literature", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sources: activeSources,
              population: pico.condition,
              intervention: pico.intervention,
              comparator: pico.comparator
            })
          })
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
              if (Array.isArray(data?.results) && data.results.length > 0) {
                const fetchedPapers: SupportingPaper[] = data.results.map((r: RawRef, idx: number) => ({
                  id: r.pmid || `pub-${idx}`,
                  pmid: r.pmid || "",
                  title: r.title || "",
                  authors: r.authors || "",
                  year: r.year || "",
                  journal: r.journal || "",
                  doi: r.doi || "",
                  url: r.url || (r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : ""),
                  source: r.source || "pubmed",
                  studyType: classifyPaperType({
                    title: r.title,
                    journal: r.journal,
                    pubType: r.pubType,
                    publicationTypes: r.publicationTypes
                  }),
                  evidenceCategory: "pico-direct",
                  point: "Retrieved direct scientific evidence matching formulated PICO criteria."
                }));
                setSupportingPapers(fetchedPapers);
              }
            })
            .catch(() => { /* silent fallback */ });
        }

        setBusy(null);
      } catch (err: unknown) {
        setNotice(err instanceof Error ? err.message : "Error extracting clinical outcomes.");
        setBusy(null);
      }
    }, 0);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [getLiteratureKeywords, router]);

  return (
    <div className="wrap">
      <header className="hdr">
        <h1>🎯 Step 3 · Select Clinical Outcome</h1>
        <p>Selected PICO question loaded from Evidence Map — choose 1 outcome to generate your commentary paper</p>
      </header>

      <main className="solo">
        {extractedPico && (
          <section className="card">
            <span className="pill">💡 Target PICO Question · {KB[extractedPico.specialty]?.label || "Clinical Medicine"}</span>
            <div className="final-q" style={{ marginTop: 10, marginBottom: 12 }}>
              <b>{extractedPico.cleanQuestion}</b>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <span className="tag" title="Population">👥 <b>P:</b> {extractedPico.condition}</span>
              <span className="tag" title="Intervention">💊 <b>I:</b> {extractedPico.intervention}</span>
              <span className="tag" title="Comparator">⚖️ <b>C:</b> {extractedPico.comparator}</span>
            </div>
          </section>
        )}

        {notice && (
          <section className="card"><div className="advisory">⚠️ {notice}</div></section>
        )}

        {/* Supporting Clinical Evidence & Study Designs */}
        {supportingPapers.length > 0 && (
          <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 className="sec-h" style={{ margin: 0 }}>
                  📚 Supporting Literature & Study Types ({supportingPapers.length})
                </h3>
                <p className="hint" style={{ marginTop: 4, marginBottom: 0 }}>
                  Clinical evidence mapped to this question, classified by methodological design (EBM Hierarchy).
                </p>
              </div>
              <span className="pill" style={{ margin: 0, fontSize: "0.74rem", background: "#f0fdfa", color: "#0f766e", border: "1px solid #99f6e4" }}>
                Methodological Taxonomy
              </span>
            </div>

            {/* Filter Pills */}
            <div className="study-type-summary" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <button
                type="button"
                className={`study-type-pill ${selectedStudyTypeFilter === "all" ? "active" : ""}`}
                style={{
                  cursor: "pointer",
                  background: selectedStudyTypeFilter === "all" ? "#0f766e" : "#f1f5f9",
                  color: selectedStudyTypeFilter === "all" ? "#ffffff" : "#334155",
                  border: "1px solid " + (selectedStudyTypeFilter === "all" ? "#0f766e" : "#cbd5e1")
                }}
                onClick={() => setSelectedStudyTypeFilter("all")}
              >
                All Study Types ({supportingPapers.length})
              </button>
              {studyTypeCounts.map(({ type, count }) => {
                const style = getStudyTypeBadgeStyle(type);
                const isSelected = selectedStudyTypeFilter === type;
                return (
                  <button
                    key={type}
                    type="button"
                    className="study-type-pill"
                    style={{
                      cursor: "pointer",
                      backgroundColor: isSelected ? style.color : style.bg,
                      color: isSelected ? "#ffffff" : style.color,
                      borderColor: style.border,
                      boxShadow: isSelected ? "0 1px 4px rgba(0,0,0,0.15)" : "none"
                    }}
                    onClick={() => setSelectedStudyTypeFilter(isSelected ? "all" : type)}
                    title={`Filter to ${type} papers`}
                  >
                    <b>{type}</b> ({count})
                  </button>
                );
              })}
            </div>

            {/* Papers List */}
            <div className="paper-list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredPapers.map((paper, pIdx) => {
                const style = getStudyTypeBadgeStyle(paper.studyType);
                return (
                  <div key={paper.id || pIdx} className="paper-item-card">
                    <div className="paper-item-header">
                      {(() => {
                        const srcBadge = getSourceBadge(paper.source, paper.pmid);
                        return (
                          <span className={`source-badge-mini ${srcBadge.className}`} style={{ marginRight: 6 }}>
                            {srcBadge.icon} {srcBadge.label}
                          </span>
                        );
                      })()}
                      <span
                        className="study-type-badge"
                        style={{
                          backgroundColor: style.bg,
                          color: style.color,
                          borderColor: style.border
                        }}
                        title={`Study Design: ${paper.studyType}`}
                      >
                        🏷️ {paper.studyType}
                      </span>
                      <span className={`evidence-category-tag ${paper.evidenceCategory}`}>
                        {paper.evidenceCategory === "established" ? "✓ Established Support" : paper.evidenceCategory === "uncertain" ? "⚖️ Conflicting Evidence" : "🎯 Direct PICO Support"}
                      </span>
                      {paper.year && <span className="paper-year">[{paper.year}]</span>}
                    </div>

                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="paper-title-link"
                      title="Open paper in PubMed"
                    >
                      {paper.title} ↗
                    </a>

                    <div className="paper-meta-row">
                      {paper.authors && <span className="paper-author">{paper.authors}</span>}
                      {paper.journal && <span className="paper-journal">{paper.journal}</span>}
                      {paper.pmid && (
                        <span className="paper-pmid" title="PubMed Identifier">
                          PMID: {paper.pmid}
                        </span>
                      )}
                      {paper.doi && (
                        <span className="paper-doi" title="Digital Object Identifier">
                          DOI: {paper.doi}
                        </span>
                      )}
                    </div>

                    {paper.point && (
                      <div className="paper-point-context">
                        <span className="hint" style={{ margin: 0, fontSize: "0.78rem" }}>
                          💡 <b>Clinical Finding:</b> {paper.point}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {outcomeOptions.length > 0 && busy !== "formulate" && (
          <section className="card">
            <h3 className="sec-h" style={{ marginTop: 0 }}>
              📋 Literature-Derived Outcomes — Click 1 to continue (No manual typing needed)
            </h3>
            <p className="hint">
              These 4–6 outcomes are ranked by clinical importance and grounded in current PubMed evidence. Click an outcome card below to select it.
            </p>

            <div className="chips outcome-chips" role="group" aria-label="Outcome options" style={{ marginTop: 14 }}>
              {outcomeOptions.map(opt => {
                const isSel = selectedOutcome === opt.label;
                const isRec = opt.id === recommendedId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`chip outcome-chip ${isSel ? "chip-on" : ""} ${isRec ? "chip-recommended" : ""}`}
                    aria-pressed={isSel}
                    aria-label={`${opt.label}${isRec ? ", recommended primary outcome" : ""}`}
                    onClick={() => setSelectedOutcome(opt.label)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                      <span className="outcome-chip-label">{opt.label}</span>
                      {isSel && (
                        <span style={{ fontWeight: 700, fontSize: "0.85rem", color: isSel ? "#fff" : "inherit" }}>
                          ✓ Selected
                        </span>
                      )}
                    </div>
                    <span className="outcome-chip-meta">
                      {isRec && <span className="outcome-badge">Recommended</span>}
                      <span className="outcome-category">{opt.category.replace(/-/g, " ")}</span>
                      <span className="outcome-evidence-types" style={{ fontSize: "0.72rem", color: isSel ? "#e0f2fe" : "var(--muted, #64748b)", fontWeight: 500 }}>
                        • Evidence: {primaryStudyTypes}
                      </span>
                    </span>
                    <span className="outcome-why">{opt.rationale}</span>
                  </button>
                );
              })}
            </div>

            {recommendedRationale && (
              <p className="hint" style={{ marginTop: 14 }}>
                💡 <b>Evidence Grounding:</b> {recommendedRationale}
              </p>
            )}

            {/* Step 3: Reference Citation Style for PDF Deliverable */}
            <div
              className="citation-style-box"
              style={{
                marginTop: 20,
                marginBottom: 16,
                padding: "16px 18px",
                background: "#f0fdfa",
                border: "1.5px solid #99f6e4",
                borderRadius: 10
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0f766e", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  📚 Reference Citation Style for PDF Deliverable:
                </span>
                <span className="source-badge-mini source-badge-pubmed" style={{ fontSize: "0.72rem", padding: "2px 8px" }}>
                  Selected: {citationStyle === "vancouver" ? "Vancouver (Without Brackets)" : citationStyle === "apa" ? "APA 7th Edition" : "Harvard Style"}
                </span>
              </div>
              <p className="hint" style={{ margin: "0 0 12px 0", fontSize: "0.82rem", color: "#334155" }}>
                Choose how in-text citations and the bibliography will be formatted in your commentary and exported PDF documents:
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                {CITATION_STYLE_OPTIONS.map((opt) => {
                  const isSel = citationStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`source-choice-card ${isSel ? "active" : ""}`}
                      onClick={() => {
                        setCitationStyle(opt.id);
                        sset(KEYS.citationStyle, opt.id);
                      }}
                      style={{
                        padding: "12px 14px",
                        textAlign: "left",
                        cursor: "pointer",
                        borderRadius: 8,
                        border: isSel ? "2px solid #0f766e" : "1px solid #cbd5e1",
                        background: isSel ? "#ffffff" : "#f8fafc",
                        boxShadow: isSel ? "0 2px 8px rgba(15, 118, 110, 0.15)" : "none",
                        transition: "all 0.15s ease",
                        width: "100%"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: isSel ? "#0f766e" : "#1e293b" }}>
                          {opt.name}
                        </span>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: isSel ? "#0f766e" : "#e2e8f0",
                            color: isSel ? "#ffffff" : "#64748b"
                          }}
                        >
                          {opt.badge}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.76rem", color: "#64748b", marginBottom: 6, lineHeight: 1.4 }}>
                        {opt.shortDescription}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#0f766e", background: "#f0fdf4", padding: "4px 6px", borderRadius: 4, border: "1px solid #d1fae5" }}>
                        <b>In-text:</b> {opt.inTextExample}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button
                className="primary"
                style={{ padding: "12px 28px", fontSize: "1rem" }}
                disabled={!selectedOutcome || !!busy}
                onClick={() => selectedOutcome && proceedToCommentary(selectedOutcome)}
              >
                {selectedOutcome
                  ? `Continue to Scientific Commentary with "${selectedOutcome}" ➜`
                  : "Click an outcome card above to continue ➜"}
              </button>
            </div>

            <p className="hint" style={{ marginTop: 8 }} aria-live="polite">
              {selectedOutcome
                ? `Selected outcome: "${selectedOutcome}". Click above to immediately generate your Step 4 Scientific Commentary Paper.`
                : "Select one outcome card above to proceed."}
            </p>

            <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border, #e2e8f0)" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.95rem", color: "var(--text-muted, #64748b)" }}>
                ✏️ Or Enter a Custom Outcome (Optional)
              </h4>
              <p className="hint" style={{ marginBottom: 10 }}>
                If you prefer an endpoint not listed in the cards above, type it below and click Continue.
              </p>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <input
                  className="free-input"
                  type="text"
                  aria-label="Custom clinical outcome"
                  value={customOutcome}
                  onChange={(e) => setCustomOutcome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customOutcome.trim()) {
                      e.preventDefault();
                      proceedToCommentary(customOutcome.trim());
                    }
                  }}
                  placeholder="e.g., spontaneous preterm birth before 32 weeks, neonatal ICU stay..."
                  style={{ flex: 1, padding: "10px 14px" }}
                />
                <button
                  className="secondary"
                  style={{ whiteSpace: "nowrap", padding: "10px 18px" }}
                  disabled={!customOutcome.trim() || !!busy}
                  onClick={() => customOutcome.trim() && proceedToCommentary(customOutcome.trim())}
                >
                  Continue with Custom Outcome ➜
                </button>
              </div>
            </div>
          </section>
        )}

        {busy === "loading" && (
          <section className="card">
            <AnimatedProcessingIndicator
              message="Extracting PICO parameters & literature outcomes…"
              secondaryMessage="Analyzing PubMed evidence to curate relevant clinical endpoints."
            />
          </section>
        )}

        {busy === "formulate" && (
          <section className="card">
            <AnimatedProcessingIndicator
              message="Formulating clinical question & evidence parameters…"
              secondaryMessage="Preparing Vancouver-style commentary generation."
            />
          </section>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="link" onClick={() => router.push("/gap")}>← Back to Evidence Map</button>
          <button className="link" onClick={() => router.push("/")}>← Start over</button>
        </div>
      </main>

      <footer>Aimed v4.0 · Multi-Specialty Clinical Intelligence · Copyright©RaoufRoshdy2026</footer>
    </div>
  );
}
