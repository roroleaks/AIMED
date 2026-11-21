"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatedProcessingIndicator } from "@/components/AnimatedProcessingIndicator";
import { sget, sset, sdel, KEYS, isMatchingScreenCache } from "@/lib/session";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { useAimedContext } from "@/context/AimedContext";
import type { PicoWord } from "@/lib/pico-roles";
import type { ScreenCategory, ScreenPhrase, ScreenPayload } from "@/lib/deterministic-screen";

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

export default function ScreenPage() {
  const router = useRouter();
  const { specialty, currentSpecialty } = useAimedContext();
  const [loading, setLoading] = useState(false);
  const [screenData, setScreenData] = useState<ScreenPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ScreenCategory | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const activeSpecialty = specialty || sget<string>(KEYS.specialty) || "obgyn";

  const fetchScreen = useCallback(async (force = false) => {
    const rawWords = sget<PicoWord[]>(KEYS.picoWords);
    if (!rawWords || !Array.isArray(rawWords) || rawWords.length < 3 || rawWords.length > 5) {
      router.replace("/");
      return;
    }

    if (!force) {
      const cached = sget<ScreenPayload>(KEYS.screen);
      if (cached && isMatchingScreenCache(cached, rawWords, activeSpecialty)) {
        setScreenData(cached);
        const existingChoice = sget<{ category: ScreenCategory; phrase: string }>(KEYS.choice);
        if (existingChoice?.category && cached.phrases[existingChoice.category]) {
          setSelectedCategory(existingChoice.category);
          setConfirmed(true);
        }
        return;
      }
    }

    setLoading(true);
    setError(null);
    setConfirmed(false);
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "screen",
          words: rawWords,
          specialty: activeSpecialty
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null as { error?: string } | null);
        setError(body?.error || `The screening service returned an error (${res.status}). Please try again.`);
        return;
      }

      const data = await res.json();
      const payload: ScreenPayload = {
        inputWords: rawWords.map(w => w.word),
        source: data.aiRefined ? "ai" : "deterministic",
        phrases: data.phrases,
        corpusStats: data.corpusStats,
        specialty: activeSpecialty,
        sources: data.sources
      };
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(KEYS.choice);
      }
      sdel(KEYS.choice);
      setScreenData(payload);
      sset(KEYS.screen, payload);

      const existingChoice = sget<{ category: ScreenCategory; phrase: string }>(KEYS.choice);
      if (existingChoice?.category && payload.phrases[existingChoice.category]) {
        setSelectedCategory(existingChoice.category);
        setConfirmed(true);
      }
    } catch {
      setError("Network or server error during literature screening. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [activeSpecialty, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchScreen();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchScreen]);

  const handleSelectFocus = (cat: ScreenCategory) => {
    if (!screenData) return;
    const rawWords = sget<PicoWord[]>(KEYS.picoWords) || [];
    const chosen = screenData.phrases[cat];
    if (!chosen) return;

    setSelectedCategory(cat);
    const updatedPayload: ScreenPayload = {
      phrases: screenData.phrases,
      corpusStats: screenData.corpusStats,
      inputWords: screenData.inputWords || rawWords.map(w => w.word),
      specialty: activeSpecialty,
      sources: screenData.sources,
      source: screenData.source
    };
    sset(KEYS.screen, updatedPayload);
    sset(KEYS.choice, {
      category: cat,
      phrase: chosen.phrase
    });
    setConfirmed(true);
  };

  const categories: Array<{
    key: ScreenCategory;
    title: string;
    icon: string;
    borderColor: string;
    selectedBorderColor: string;
    badgeColor: string;
    bgColor: string;
  }> = [
    {
      key: "established",
      title: "Established evidence",
      icon: "✅",
      borderColor: "#10b981",
      selectedBorderColor: "#059669",
      badgeColor: "#065f46",
      bgColor: "#f0fdf4"
    },
    {
      key: "conflicting",
      title: "Conflicting evidence",
      icon: "⚖️",
      borderColor: "#f59e0b",
      selectedBorderColor: "#d97706",
      badgeColor: "#92400e",
      bgColor: "#fffbeb"
    },
    {
      key: "gap",
      title: "Evidence gap",
      icon: "🔍",
      borderColor: "#8b5cf6",
      selectedBorderColor: "#7c3aed",
      badgeColor: "#5b21b6",
      bgColor: "#faf5ff"
    }
  ];

  return (
    <div className="wrap">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-left">
            <span className="title-main">
              AIMed <span className="version-badge">v4.0 Multi-Specialty</span>
            </span>
          </div>
          <div className="hdr-center">
            <h1>Step 2 · Deterministic Screening</h1>
            <p>Three PICO phrases evaluated across authoritative multi-source literature</p>
          </div>
        </div>
      </header>

      <WorkflowStepper currentStep={2} />

      <main id="main" className="solo">
        {(!screenData || loading) && !error && (
          <section className="card">
            <AnimatedProcessingIndicator
              message="Screening literature across clinical databases…"
              secondaryMessage="PubMed · Europe PMC · Cochrane CENTRAL · OpenAlex · CrossRef · Semantic Scholar"
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
                  <div className="skeleton-box" style={{ height: 20, width: i % 2 === 0 ? "85%" : "92%", marginBottom: 10 }} />
                  <div className="skeleton-box" style={{ height: 14, width: i % 2 === 0 ? "60%" : "70%" }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {error && (
          <section className="card">
            <div className="advisory" style={{ borderColor: "#fca5a5", background: "#fef2f2", color: "#991b1b" }}>
              ⚠️ {error}
            </div>
            <div className="row" style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => router.push("/")}
              >
                ← Change words
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => fetchScreen(true)}
              >
                🔄 Try again
              </button>
            </div>
          </section>
        )}

        {screenData && !loading && !error && (
          <section className="card">
            {/* Active Domain Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="specialty-active-badge">
                  {currentSpecialty.icon} {currentSpecialty.label}
                </span>
                <span className="pill" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  Screened {screenData.corpusStats.screened} of {screenData.corpusStats.retrieved} retrieved records
                </span>
                <span
                  className="pill"
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    background: screenData.source === "ai" ? "#ecfdf5" : "#f1f5f9",
                    color: screenData.source === "ai" ? "#065f46" : "#475569"
                  }}
                >
                  {screenData.source === "ai" ? "🤖 AI-refined" : "📋 Deterministic base"}
                </span>
              </div>
              <div>
                <button
                  type="button"
                  className="secondary"
                  disabled={loading}
                  onClick={() => router.push("/")}
                >
                  ← Change words
                </button>
              </div>
            </div>

            {/* Inline Confirmation when a card is selected */}
            {confirmed && selectedCategory && (
              <div
                className="advisory"
                style={{
                  background: "#ecfdf5",
                  borderColor: "#6ee7b7",
                  color: "#065f46",
                  fontWeight: 600,
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>✓</span>
                  <span>Focus saved — ready for Explorer</span>
                </div>
                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: "0.85rem", padding: "6px 16px" }}
                  onClick={() => router.push("/explore")}
                >
                  Continue to Explorer →
                </button>
              </div>
            )}

            {/* Three Category Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {categories.map(cat => {
                const item: ScreenPhrase = screenData.phrases[cat.key];
                const isSelected = selectedCategory === cat.key;
                return (
                  <div
                    key={cat.key}
                    className={`variant-card${isSelected ? " selected" : ""}`}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => handleSelectFocus(cat.key)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectFocus(cat.key);
                      }
                    }}
                    style={{
                      borderLeft: isSelected ? `4px solid ${cat.selectedBorderColor}` : `4px solid ${cat.borderColor}`,
                      backgroundColor: isSelected ? cat.bgColor : undefined
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: cat.badgeColor, fontSize: "0.95rem" }}>
                        {cat.icon} {cat.title}
                      </span>
                      <button
                        type="button"
                        className={isSelected ? "primary" : "secondary"}
                        style={{ fontSize: "0.82rem", padding: "4px 12px" }}
                        onClick={e => {
                          e.stopPropagation();
                          handleSelectFocus(cat.key);
                        }}
                      >
                        {isSelected ? "✓ Focus selected" : "Choose this focus"}
                      </button>
                    </div>

                    <p style={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1.45, margin: "4px 0 8px 0", color: "#0f172a" }}>
                      {item.phrase}
                    </p>
                    <p style={{ fontSize: "0.88rem", color: "#64748b", margin: 0, lineHeight: 1.45 }}>
                      {item.basis}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Literature Sources Retrospective Chips & Corpus Stats */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155" }}>
                  Literature Sources Contribution
                </span>
                <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                  Relaxation level: {screenData.corpusStats.relaxationLevel} · Total retrieved: {screenData.corpusStats.retrieved}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {screenData.sources && screenData.sources.length > 0 ? (
                  screenData.sources.map(src => (
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
                  ))
                ) : (
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Multi-source snapshot unavailable</span>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => router.push("/")}
              >
                ← Change words
              </button>
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={() => fetchScreen(true)}
              >
                🔄 Refresh screening
              </button>
            </div>
          </section>
        )}
      </main>

      <footer>
        Aimed v4.0 — Multi-Specialty Clinical Intelligence Platform · Step 2 Deterministic Screening<br />
        Copyright©RaoufRoshdy2026
      </footer>
    </div>
  );
}
