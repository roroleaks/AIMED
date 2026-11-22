"use client";

import { useState, useMemo, useCallback, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { sset, resetSession, KEYS } from "@/lib/session";
import { assignPicoRoles, type PicoRole, type PicoWord } from "@/lib/pico-roles";
import { useAimedContext } from "@/context/AimedContext";
import { SpecialtySelector } from "@/components/SpecialtySelector";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { PhiNotice } from "@/components/PhiNotice";
import type { PicoPreset } from "@/lib/specialties";
import { SEARCH_SOURCE_OPTIONS } from "@/lib/literature-sources";
import { APP_VERSION } from "@/lib/version";
import { AppFooter } from "@/components/AppFooter";
import { AuthorHeaderRight } from "@/components/AuthorHeaderRight";

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

export default function DashboardPage() {
  const router = useRouter();
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
  }, [words, setRawInput, setSavedNotice]);

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

  // Submit ("Save words") — persists specialty and words, and navigates directly to /screen
  const start = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;
    sset(KEYS.specialty, specialty);
    sset(KEYS.picoWords, picoWords);
    sset(KEYS.inputText, words.join(", "));
    router.push("/screen");
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
              Aimed <span className="version-badge">v{APP_VERSION}</span>
            </span>
          </div>
          <div className="hdr-center">
            <h1>Clinical Intelligence Dashboard</h1>
            <p>Step 1 · Formulate PICO Questions with Multi-Source Literature Retrieval</p>
          </div>
          <AuthorHeaderRight />
        </div>
      </header>

      {/* Workflow Stepper: Step 1 Active */}
      <div style={{ maxWidth: 1380, margin: "12px auto 0 auto", padding: "0 24px", width: "100%" }}>
        <WorkflowStepper currentStep={1} />
      </div>

      {/* Core Clinical Workspace Section */}
      <main className="solo" ref={workspaceRef}>
        <section className="card">
          {/* Active Domain Status Banner with Change Specialty trigger */}
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
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => router.push("/")}
                style={{
                  fontSize: "0.85rem",
                  padding: "8px 14px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6
                }}
                title="Return to specialty selection portal"
              >
                ← Change Specialty
              </button>
              <button
                type="button"
                id="btn-choose-speciality"
                className="primary"
                onClick={() => setIsSpecialtyModalOpen(true)}
                style={{
                  background: "#0f766e",
                  color: "#ffffff",
                  padding: "8px 16px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  borderRadius: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 8px rgba(15, 118, 110, 0.25)",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                🏥 Quick Switch ▾
              </button>
            </div>
          </div>

          <form onSubmit={start} className="aimed-form">
            {/* Presets Bar */}
            <div className="aimed-preset-strip" style={{ marginBottom: 16 }}>
              <span className="aimed-preset-label">
                💡 Clinical Question Presets ({currentSpecialty.shortName}):
              </span>
              <div className="aimed-preset-chips">
                {activePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="aimed-preset-chip"
                    onClick={() => applyPreset(preset)}
                    title={preset.description}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Keyword Input Area */}
            <div className="input-group" style={{ marginBottom: 16 }}>
              <label htmlFor="raw-pico-input" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                Clinical keywords (3 to 5 terms):
              </label>
              <textarea
                id="raw-pico-input"
                className="aimed-textarea"
                rows={3}
                placeholder="e.g. women with endometriosis, laparoscopic surgery, medical therapy, pain score reduction"
                value={rawInput}
                onChange={(e) => {
                  setRawInput(e.target.value);
                  setSavedNotice(null);
                }}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.95rem" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span className={`count-hint ${canSubmit ? "ok" : "warn"}`} style={{ fontSize: "0.82rem", color: canSubmit ? "#166534" : "#b45309" }}>
                  {countHint}
                </span>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  {words.length} / 5 terms
                </span>
              </div>
            </div>

            {/* Live Interactive PICO Role Chips Strip */}
            {picoWords.length > 0 && (
              <div className="aimed-chips-container" style={{ marginBottom: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569", marginBottom: 8 }}>
                  🏷️ Classified PICO Parameters:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {picoWords.map((pw, idx) => {
                    const cfg = ROLE_CONFIG[pw.role] || ROLE_CONFIG.other;
                    return (
                      <span
                        key={`${pw.word}-${idx}`}
                        className="aimed-role-chip"
                        style={{
                          background: cfg.bg,
                          border: `1px solid ${cfg.border}`,
                          color: cfg.text,
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6
                        }}
                      >
                        <span
                          style={{
                            background: cfg.badgeBg,
                            color: "#fff",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            padding: "2px 5px",
                            borderRadius: 4
                          }}
                        >
                          {cfg.badge}
                        </span>
                        <span>{pw.word}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWord(idx)}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: cfg.text,
                            padding: "0 2px",
                            fontWeight: 700,
                            fontSize: "0.85rem"
                          }}
                          title={`Remove ${pw.word}`}
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inline Saved Confirmation */}
            {savedNotice && (
              <div
                className="advisory"
                style={{
                  background: "#ecfdf5",
                  borderColor: "#6ee7b7",
                  color: "#065f46",
                  padding: "10px 14px",
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>✓</span>
                  <span>{savedNotice}</span>
                </div>
                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: "0.85rem", padding: "6px 16px" }}
                  onClick={() => router.push("/screen")}
                >
                  Continue to Screening →
                </button>
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
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                  📚 Search Databases:
                </span>
                <span className="pill" style={{ fontSize: "0.78rem", background: "#f1f5f9", color: "#334155" }}>
                  PubMed · Europe PMC · Cochrane · OpenAlex · CrossRef · Semantic Scholar
                </span>
              </div>
              <button
                type="button"
                className="secondary"
                style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                onClick={() => setIsSourcesModalOpen(true)}
              >
                Configure sources ▾
              </button>
            </div>

            {/* Patient Privacy Notice */}
            <PhiNotice />

            <div className="row" style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="primary"
                onClick={start}
                type="submit"
                disabled={!canSubmit}
                style={{ padding: "12px 28px", fontSize: "1rem", fontWeight: 700 }}
              >
                Save words & Screen literature →
              </button>
              {(rawInput || picoWords.length > 0) && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    resetSession();
                    setRawInput("");
                    setSavedNotice(null);
                  }}
                  style={{ padding: "12px 20px", fontSize: "0.95rem" }}
                  title="Clear all inputs and reset session state"
                >
                  ↺ Reset
                </button>
              )}
            </div>
          </form>
        </section>
      </main>

      <AppFooter />

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
            <div className="aimed-modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setIsSpecialtyModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sources Config Dialog Modal */}
      {isSourcesModalOpen && (
        <div className="aimed-modal-backdrop" onClick={() => setIsSourcesModalOpen(false)}>
          <div className="aimed-modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="aimed-modal-header">
              <h3>📚 Literature Search Sources (8 Sources)</h3>
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
              <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: 12 }}>
                All authoritative literature search engines are actively queried in parallel with deduplication:
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                {SEARCH_SOURCE_OPTIONS.map((src) => (
                  <div
                    key={src.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#1e293b" }}>{src.name}</span>
                      <span style={{ fontSize: "0.78rem", color: "#64748b", marginLeft: 8 }}>{src.provider}</span>
                      <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{src.description}</div>
                    </div>
                    <span className="pill" style={{ background: "#ecfdf5", color: "#065f46", fontSize: "0.75rem", fontWeight: 700 }}>
                      Active
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="aimed-modal-footer">
              <button
                type="button"
                className="primary"
                onClick={() => setIsSourcesModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
