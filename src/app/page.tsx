"use client";

import { useState, useMemo, useCallback, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import { sset, KEYS } from "@/lib/session";
import { assignPicoRoles, type PicoRole, type PicoWord } from "@/lib/pico-roles";
import { useAimedContext } from "@/context/AimedContext";
import { SpecialtySelector } from "@/components/SpecialtySelector";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { PhiNotice } from "@/components/PhiNotice";
import type { PicoPreset } from "@/lib/specialties";
import { SEARCH_SOURCE_OPTIONS } from "@/lib/literature-sources";

// sessionStorage is browser-only: useSyncExternalStore provides safe hydration without cascading renders
function sessionPicoSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    const savedPico = window.sessionStorage.getItem(KEYS.picoWords);
    if (savedPico) {
      const parsed = JSON.parse(savedPico);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((p: { word?: string } | string) => (typeof p === "string" ? p : p.word ?? ""))
          .filter(Boolean)
          .join(", ");
      }
    }
    const savedText = window.sessionStorage.getItem(KEYS.inputText);
    if (savedText) {
      return JSON.parse(savedText);
    }
  } catch {}
  return "";
}

const serverSnapshot = () => "";
const subscribeToNothing = () => () => {};

const ROLE_CONFIG: Record<
  PicoRole,
  { label: string; badge: string; bg: string; border: string; text: string; badgeBg: string }
> = {
  population: {
    label: "Population",
    badge: "P",
    bg: "#eff6ff",
    border: "#bfdbfe",
    text: "#1e40af",
    badgeBg: "#3b82f6"
  },
  intervention: {
    label: "Intervention",
    badge: "I",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    text: "#166534",
    badgeBg: "#22c55e"
  },
  comparator: {
    label: "Comparator",
    badge: "C",
    bg: "#fffbeb",
    border: "#fde68a",
    text: "#92400e",
    badgeBg: "#f59e0b"
  },
  outcome: {
    label: "Outcome",
    badge: "O",
    bg: "#faf5ff",
    border: "#e9d5ff",
    text: "#6b21a8",
    badgeBg: "#a855f7"
  },
  other: {
    label: "Other",
    badge: "X",
    bg: "#f8fafc",
    border: "#cbd5e1",
    text: "#475569",
    badgeBg: "#64748b"
  }
};

export default function Home() {
  const { specialty, setSpecialty, currentSpecialty, activePresets } = useAimedContext();
  const workspaceRef = useRef<HTMLDivElement>(null);

  const restoredInput = useSyncExternalStore(subscribeToNothing, sessionPicoSnapshot, serverSnapshot);
  const [draft, setDraft] = useState<string | null>(null);
  const rawInput = draft ?? restoredInput;
  const setRawInput = useCallback((v: string) => setDraft(v), []);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Modal dialog states
  const [isSpecialtyModalOpen, setIsSpecialtyModalOpen] = useState(false);
  const [isSourcesModalOpen, setIsSourcesModalOpen] = useState(false);

  // Split input into clinical keywords on commas, semicolons, or newlines
  const words = useMemo(() => {
    return rawInput
      .split(/[,;\n]/)
      .map(w => w.trim())
      .filter(w => w.length > 0);
  }, [rawInput]);

  // Deterministically assign PICO roles to all keywords
  const picoWords: PicoWord[] = useMemo(() => {
    if (words.length === 0) return [];
    return assignPicoRoles(words);
  }, [words]);

  // Role-strip action: delete word from list and update input string
  const handleRemoveWord = useCallback((indexToRemove: number) => {
    const nextWords = words.filter((_, idx) => idx !== indexToRemove);
    setRawInput(nextWords.join(", "));
    setSavedNotice(null);
  }, [words, setRawInput]);

  // Validation: 3 to 5 non-empty clinical keywords required
  const canSubmit = words.length >= 3 && words.length <= 5;

  const countHint = useMemo(() => {
    if (words.length === 0) {
      return "Enter 3 to 5 comma-separated clinical keywords.";
    }
    if (words.length < 3) {
      const needed = 3 - words.length;
      return `${words.length} keyword${words.length === 1 ? "" : "s"} entered — add ${needed} more keyword${needed > 1 ? "s" : ""} (3 required minimum).`;
    }
    if (words.length > 5) {
      const excess = words.length - 5;
      return `${words.length} keywords entered — maximum is 5. Remove ${excess} term${excess > 1 ? "s" : ""} using the chip remove buttons.`;
    }
    return `${words.length} clinical keywords entered — ready to save.`;
  }, [words.length]);

  // "Try an example" preset handler
  const applyPreset = (preset: PicoPreset) => {
    setRawInput(preset.raw);
    setSavedNotice(null);
    if (workspaceRef.current) {
      workspaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSelectSpecialtyFromCard = (id: string) => {
    setSpecialty(id);
    setSavedNotice(null);
    if (workspaceRef.current) {
      workspaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Submit ("Save words") — persists specialty and words, shows inline confirmation without navigating
  const start = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;
    sset(KEYS.specialty, specialty);
    sset(KEYS.picoWords, picoWords);
    sset(KEYS.inputText, words.join(", "));
    setSavedNotice("Words saved — screening arrives in Step 2");
  };

  return (
    <div className="wrap">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-left">
            <Image
              src="/icon-192.png"
              alt="AIMed App Icon"
              width={34}
              height={34}
              style={{ borderRadius: 8, display: "inline-block", verticalAlign: "middle", boxShadow: "0 2px 10px rgba(0, 0, 0, 0.25)" }}
              priority
            />
            <span className="title-main">
              Aimed <span className="version-badge">v4.0 Multi-Specialty</span>
            </span>
          </div>
          <div className="hdr-center">
            <h1>From Clinical Uncertainty to Answerable Questions</h1>
            <p>AI Medical Intelligence · Multi-Specialty Clinical Evidence Platform</p>
          </div>
          <div className="hdr-right">
            <span className="author-name">
              <Image src="/dr-raouf.jpg" alt="Dr Raouf Roshdy" className="author-photo" width={72} height={72} />
              Dr Raouf Roshdy
            </span>
          </div>
        </div>
      </header>

      {/* Hero Welcome Banner */}
      <section className="aimed-hero">
        <div className="aimed-badge">
          <span>🩺 Multi-Specialty Evidence Engine</span>
        </div>
        <h2 className="aimed-hero-title">
          Clinical Intelligence Tailored to Your <span>Specialty</span>
        </h2>
        <p className="aimed-hero-subtitle">
          Select your medical domain below to configure clinical taxonomies, authoritative practice guidelines, and evidence-gap retrieval protocols.
        </p>
      </section>

      {/* Core Clinical Workspace Section */}
      <main className="solo" ref={workspaceRef}>
        <section className="card">
          {/* Active Domain Status Banner with Modal Trigger */}
          <div className="aimed-active-banner" style={{ marginBottom: 18 }}>
            <div className="aimed-banner-left">
              <span className="aimed-banner-icon">{currentSpecialty.icon}</span>
              <div>
                <div className="aimed-banner-title">
                  Active Domain: {currentSpecialty.label} ({currentSpecialty.shortName})
                </div>
                <div className="aimed-banner-sub">
                  Practice Guidelines: <b>{currentSpecialty.authorityGuidelines}</b> · Category: <b>{currentSpecialty.category}</b>
                </div>
              </div>
            </div>
            <button
              type="button"
              id="btn-choose-speciality"
              className="primary"
              onClick={() => setIsSpecialtyModalOpen(true)}
              style={{
                background: "#0f766e",
                color: "#ffffff",
                padding: "10px 20px",
                fontSize: "0.9rem",
                fontWeight: 600,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 2px 8px rgba(15, 118, 110, 0.25)",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              🏥 Choose Speciality ▾
            </button>
          </div>

          {/* Workflow Stepper: Step 1 Active, Steps 2-4 Dimmed */}
          <WorkflowStepper currentStep={1} />

          <form onSubmit={start}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <span className="pill">📝 Step 1 · Clinical Words Intake ({currentSpecialty.shortName})</span>
              <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                3–5 clinical words or short phrases required
              </span>
            </div>

            <p className="hint">
              Enter 3–5 clinically meaningful keywords or short phrases for <b>{currentSpecialty.label}</b>, separated by commas (e.g. population, intervention, comparator, outcome).
            </p>

            <label htmlFor="clinicalWordsInput" className="sr-only">Clinical keywords</label>
            <textarea
              id="clinicalWordsInput"
              aria-label="Clinical keywords"
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                setSavedNotice(null);
              }}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                fontSize: "0.95rem",
                lineHeight: 1.5,
                fontFamily: "inherit"
              }}
            />

            {/* "Try an example" chips from specialty presets */}
            {activePresets.length > 0 && (
              <div style={{ marginTop: 10, marginBottom: 14 }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  💡 Try an example for {currentSpecialty.shortName}:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {activePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="mini-btn"
                      style={{
                        background: "#f8fafc",
                        color: "#0f172a",
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: "0.80rem",
                        cursor: "pointer"
                      }}
                      onClick={() => applyPreset(preset)}
                      title={preset.description}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live Role Chips under the input with role-strip remove actions */}
            {picoWords.length > 0 && (
              <fieldset
                aria-label="PICO role assignments"
                style={{
                  marginTop: 10,
                  marginBottom: 12,
                  padding: "12px 14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8
                }}
              >
                <legend className="sr-only">PICO role assignments</legend>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    🏷️ PICO Roles (Population / Intervention / Comparator / Outcome / Other)
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {picoWords.length} keyword{picoWords.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {picoWords.map((item, idx) => {
                    const conf = ROLE_CONFIG[item.role];
                    return (
                      <div
                        key={`${item.word}-${idx}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: conf.bg,
                          border: `1px solid ${conf.border}`,
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: "0.82rem"
                        }}
                      >
                        <span
                          style={{
                            background: conf.badgeBg,
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "0.7rem",
                            padding: "2px 6px",
                            borderRadius: 4
                          }}
                        >
                          {conf.badge}
                        </span>
                        <span style={{ fontWeight: 600, color: conf.text }}>{item.word}</span>
                        <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>
                          ({conf.label})
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove keyword ${item.word}`}
                          onClick={() => handleRemoveWord(idx)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: "0.95rem",
                            lineHeight: 1,
                            padding: "0 2px",
                            marginLeft: 2
                          }}
                          title={`Remove ${item.word}`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {countHint && (
              <p className={`count-hint${!canSubmit ? " count-bad" : " count-ok"}`} aria-live="polite">
                {countHint}
              </p>
            )}

            {/* Inline confirmation when words are saved */}
            {savedNotice && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginTop: 12,
                  marginBottom: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  color: "#166534",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <span>✓</span>
                <span>{savedNotice}</span>
              </div>
            )}

            {/* Literature Search Databases Bar */}
            <div
              style={{
                marginTop: 16,
                marginBottom: 8,
                padding: "10px 14px",
                background: "#f8fafc",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1e293b", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  🌐 Literature Databases (all {SEARCH_SOURCE_OPTIONS.length} searched · mandatory):
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {SEARCH_SOURCE_OPTIONS.map(opt => (
                    <span key={opt.id} className={`source-badge-mini ${opt.badgeClass}`} style={{ fontSize: "0.72rem", padding: "2px 8px" }}>
                      {opt.icon} {opt.name}{opt.id === "googlescholar" ? " (key-gated)" : ""}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSourcesModalOpen(true)}
                className="mini-btn"
                style={{
                  background: "#ffffff",
                  border: "1px solid #0f766e",
                  color: "#0f766e",
                  fontWeight: 700,
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5
                }}
              >
                ℹ️ About the Databases
              </button>
            </div>

            {/* Patient Privacy Notice */}
            <PhiNotice />

            <div className="row" style={{ marginTop: 16 }}>
              <button className="primary" onClick={start} type="submit" disabled={!canSubmit} style={{ padding: "12px 28px", fontSize: "1rem" }}>
                Save words
              </button>
            </div>
          </form>
        </section>
      </main>

      <footer>
        Aimed v4.0 — Multi-Specialty Clinical Intelligence Platform · Educational & Research Decision Support: always verify formulated questions clinically.<br />
        Copyright©RaoufRoshdy2026
      </footer>

      {/* Specialty Drop Menu Dialog Choice Modal */}
      {isSpecialtyModalOpen && (
        <div className="aimed-modal-backdrop" onClick={() => setIsSpecialtyModalOpen(false)}>
          <div className="aimed-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="aimed-modal-header">
              <h3>🏥 Choose Clinical Specialty Domain</h3>
              <button
                type="button"
                className="aimed-modal-close"
                onClick={() => setIsSpecialtyModalOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="aimed-modal-body">
              <SpecialtySelector
                onSelectSpecialty={(id) => {
                  handleSelectSpecialtyFromCard(id);
                  setIsSpecialtyModalOpen(false);
                }}
                onSelectPreset={(preset) => {
                  applyPreset(preset);
                  setIsSpecialtyModalOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Literature Sources Info Modal (read-only: all sources are mandatory) */}
      {isSourcesModalOpen && (
        <div className="aimed-modal-backdrop" onClick={() => setIsSourcesModalOpen(false)}>
          <div className="aimed-modal-content" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
            <div className="aimed-modal-header">
              <h3>🌐 Literature Search Databases (All Mandatory)</h3>
              <button
                type="button"
                className="aimed-modal-close"
                onClick={() => setIsSourcesModalOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="aimed-modal-body">
              <p style={{ margin: "0 0 14px 0", fontSize: "0.85rem", color: "#64748b" }}>
                Every search queries all of these databases concurrently. Results are merged and deduplicated by DOI, PMID and title, so the same paper is never listed twice.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {SEARCH_SOURCE_OPTIONS.map(opt => (
                  <div
                    key={opt.id}
                    className="source-choice-card active"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "2px solid #0f766e",
                      background: "#f0fdfa",
                      textAlign: "left",
                      width: "100%"
                    }}
                  >
                    <div style={{ fontSize: "1.5rem", lineHeight: 1 }}>{opt.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                        <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f766e" }}>
                          {opt.name}
                        </span>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 4,
                            background: opt.id === "googlescholar" ? "#f59e0b" : "#0f766e",
                            color: "#ffffff"
                          }}
                        >
                          {opt.id === "googlescholar" ? "KEY-GATED" : "ALWAYS ON"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 2 }}>
                        {opt.description}
                      </div>
                      <div style={{ fontSize: "0.70rem", color: "#94a3b8", marginTop: 2 }}>
                        Provider: {opt.provider}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="aimed-modal-footer">
              <button
                type="button"
                className="primary"
                onClick={() => setIsSourcesModalOpen(false)}
                style={{ padding: "8px 20px", fontSize: "0.9rem" }}
              >
                ✓ Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
