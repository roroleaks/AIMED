"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatedProcessingIndicator } from "@/components/AnimatedProcessingIndicator";
import { sget, sset, sdel, KEYS, isMatchingScreenCache } from "@/lib/session";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { useAimedContext } from "@/context/AimedContext";
import type { PicoWord } from "@/lib/pico-roles";
import type { ScreenCategory, ScreenPhrase, ScreenPayload } from "@/lib/deterministic-screen";
import { getSourceLabel } from "@/lib/literature-sources";
import { DRAFT_DISCLAIMER } from "@/lib/version";
import { AppFooter } from "@/components/AppFooter";
import { AuthorHeaderRight } from "@/components/AuthorHeaderRight";

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
      router.replace("/dashboard");
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

  const deduplicatedSources = (() => {
    if (!screenData?.sources) return [];
    const map = new Map<string, { id: string; name: string; count: number; ok: boolean }>();
    for (const src of screenData.sources) {
      const label = getSourceLabel(src.id);
      const existing = map.get(label);
      if (!existing) {
        map.set(label, { id: src.id, name: label, count: src.count, ok: src.ok });
      } else {
        existing.count += src.count;
        existing.ok = existing.ok || src.ok;
      }
    }
    return Array.from(map.values());
  })();

  return (
    <div className="wrap">
      <header className="hdr hdr--compact">
        <div className="hdr-inner">
          <div className="hdr-left">
            <span className="title-main">AIMed</span>
          </div>
          <div className="hdr-center">
            <h1>Step 2 · Deterministic Screening</h1>
          </div>
          <AuthorHeaderRight />
        </div>
      </header>

      <WorkflowStepper currentStep={2} />

      <main id="main" className="solo">
        {/* Persistent Draft Notice Banner */}
        <div className="notice notice--warning" style={{ marginBottom: "var(--space-4)" }}>
          <span>⚠️</span>
          <div>
            <strong>Automated draft.</strong> {DRAFT_DISCLAIMER.replace(/^Automated draft\.\s*/i, "")}
          </div>
        </div>
        {(!screenData || loading) && !error && (
          <section className="card">
            <AnimatedProcessingIndicator
              message="Screening literature across clinical databases…"
              secondaryMessage="PubMed · Europe PMC · Cochrane CENTRAL · OpenAlex · CrossRef · Semantic Scholar"
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ padding: "var(--space-4)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
                  <div className="skeleton-box" style={{ height: 20, width: i % 2 === 0 ? "85%" : "92%", marginBottom: "var(--space-2)" }} />
                  <div className="skeleton-box" style={{ height: 14, width: i % 2 === 0 ? "60%" : "70%" }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {error && (
          <section className="card">
            <div className="advisory notice notice--warning" style={{ borderColor: "#fca5a5", background: "#fef2f2", color: "#991b1b" }}>
              ⚠️ {error}
            </div>
            <div className="row" style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)" }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => router.push("/dashboard")}
              >
                ← Change words
              </button>
              <button
                type="button"
                className="btn btn--primary"
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)", flexWrap: "wrap", gap: "var(--space-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <span className="specialty-active-badge">
                  {currentSpecialty.icon} {currentSpecialty.label}
                </span>
                <span className="pill" style={{ fontSize: "var(--fs-caption)", fontWeight: 600 }}>
                  Screened {screenData.corpusStats.screened} of {screenData.corpusStats.retrieved} retrieved records
                </span>
                <span
                  className="pill"
                  style={{
                    fontSize: "var(--fs-caption)",
                    fontWeight: 600,
                    background: screenData.source === "ai" ? "var(--success-bg)" : "var(--canvas)",
                    color: screenData.source === "ai" ? "var(--success)" : "var(--muted)"
                  }}
                >
                  {screenData.source === "ai" ? "🤖 AI-refined" : "📋 Deterministic base"}
                </span>
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
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
                className="advisory notice notice--info"
                style={{
                  background: "var(--success-bg)",
                  borderColor: "var(--accent-border)",
                  color: "var(--success)",
                  fontWeight: 600,
                  marginBottom: "var(--space-4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "var(--space-2)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span>✓</span>
                  <span>Focus saved — ready for Explorer</span>
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => router.push("/explore")}
                >
                  Continue to Explorer →
                </button>
              </div>
            )}

            {/* Three Category Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {categories.map(cat => {
                const item: ScreenPhrase = screenData.phrases[cat.key];
                const isSelected = selectedCategory === cat.key;
                const isUnavailable = (item.basis || "").toLowerCase().startsWith("unavailable");
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
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)", flexWrap: "wrap", gap: "var(--space-2)" }}>
                      <span style={{ fontWeight: 700, color: cat.badgeColor, fontSize: "var(--fs-body)" }}>
                        {cat.icon} {cat.title}
                      </span>
                      <button
                        type="button"
                        className={isUnavailable ? "btn btn--secondary btn--sm" : isSelected ? "btn btn--primary btn--sm" : "btn btn--secondary btn--sm"}
                        aria-disabled={isUnavailable ? "true" : undefined}
                        onClick={e => {
                          e.stopPropagation();
                          handleSelectFocus(cat.key);
                        }}
                      >
                        {isSelected ? "✓ Focus selected" : "Choose this focus"}
                      </button>
                    </div>

                    <p style={{ fontWeight: 700, fontSize: "var(--fs-subsection)", lineHeight: "var(--lh-snug)", margin: "var(--space-1) 0 var(--space-2) 0", color: "var(--ink)", maxWidth: "var(--reading-max)" }}>
                      {item.phrase}
                    </p>
                    <p style={{ fontSize: "var(--fs-body-sm)", color: "var(--muted)", margin: 0, lineHeight: "var(--lh-normal)", maxWidth: "var(--reading-max)" }}>
                      {item.basis}
                    </p>
                    {isUnavailable && (
                      <div className="notice notice--warning" style={{ fontSize: "var(--fs-caption)", padding: "var(--space-1) var(--space-2)", marginTop: "var(--space-2)" }}>
                        ⚠️ Not supported by retrieved evidence
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Literature Sources Retrospective Chips & Corpus Stats */}
            <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                <span style={{ fontSize: "var(--fs-caption)", fontWeight: 600, color: "var(--ink-2)" }}>
                  Literature Sources Contribution
                </span>
                <span style={{ fontSize: "var(--fs-caption)", color: "var(--muted-2)" }}>
                  Relaxation level: {screenData.corpusStats.relaxationLevel} · Total retrieved: {screenData.corpusStats.retrieved}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {deduplicatedSources.length > 0 ? (
                  deduplicatedSources.map(src => {
                    const isInactive = !src.ok || src.count === 0;
                    return (
                      <span
                        key={src.name}
                        className={`source-badge-mini ${isInactive ? "source-badge-inactive" : `source-badge-${src.id.toLowerCase().replace(/[^a-z0-9]/g, "")}`}`}
                        style={isInactive ? { color: "var(--muted)", background: "var(--canvas)", borderColor: "var(--border-strong)", borderStyle: "dashed" } : undefined}
                      >
                        {src.ok && src.count > 0 ? "●" : "○"} {src.name}: {src.count > 0 ? src.count : "0 results"}
                      </span>
                    );
                  })
                ) : (
                  <span style={{ fontSize: "var(--fs-caption)", color: "var(--muted-2)" }}>Multi-source snapshot unavailable</span>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ marginTop: "var(--space-5)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => router.push("/dashboard")}
              >
                ← Change words
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={loading}
                onClick={() => fetchScreen(true)}
              >
                🔄 Refresh screening
              </button>
            </div>
          </section>
        )}
      </main>

      <AppFooter stepText="Step 2 Deterministic Screening" />
    </div>
  );
}
