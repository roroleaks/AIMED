"use client";

import { useState, useMemo, useCallback, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { sset, resetSession, KEYS } from "@/lib/session";
import { assignPicoRoles, type PicoRole, type PicoWord } from "@/lib/pico-roles";
import { useAimedContext } from "@/context/AimedContext";
import { SpecialtySelector } from "@/components/SpecialtySelector";
import { Modal } from "@/components/Modal";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { PhiNotice } from "@/components/PhiNotice";
import { PresetCard } from "@/components/PresetCard";
import { keywordsPlaceholderFor, type PicoPreset } from "@/lib/specialties";
import { SEARCH_SOURCE_OPTIONS } from "@/lib/literature-sources";
import { AppFooter } from "@/components/AppFooter";
import { AuthorHeaderRight } from "@/components/AuthorHeaderRight";

// sessionStorage is browser-only: useSyncExternalStore provides safe hydration without cascading renders
function sessionPicoSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    // The keywords box is saved as the user types or picks a preset, so a reload restores exactly
    // what was on screen. It wins over the words saved at the last "Save & Screen", which are only
    // the fallback for a session that never typed in the box.
    const savedText = window.sessionStorage.getItem(KEYS.inputText);
    if (savedText !== null) {
      const parsed = JSON.parse(savedText);
      if (typeof parsed === "string") return parsed;
    }
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
  const setRawInput = useCallback((v: string) => {
    setDraft(v);
    sset(KEYS.inputText, v);
  }, []);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const quickSwitchTriggerRef = useRef<HTMLButtonElement>(null);
  const sourcesTriggerRef = useRef<HTMLButtonElement>(null);

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
    setActivePresetId(preset.id);
    setRawInput(preset.raw);
    setSavedNotice(null);
    setHasAttemptedSubmit(false);
    if (workspaceRef.current) {
      workspaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSelectSpecialtyFromCard = (id: string) => {
    setActivePresetId(null);
    setSpecialty(id);
    setSavedNotice(null);
    setHasAttemptedSubmit(false);
    if (workspaceRef.current) {
      workspaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Submit ("Save words") — persists specialty and words, and navigates directly to /screen
  const start = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!canSubmit) return;
    sset(KEYS.specialty, specialty);
    sset(KEYS.picoWords, picoWords);
    sset(KEYS.inputText, words.join(", "));
    router.push("/screen");
  };

  return (
    <div className="wrap">
      <header className="hdr" data-testid="app-header">
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
              AIMed
            </span>
          </div>
          <div className="hdr-center">
            <h1>Clinical Intelligence Dashboard</h1>
            <p>Step 1 · Enter clinical keywords</p>
          </div>
          <AuthorHeaderRight />
        </div>
      </header>

      {/* Workflow Stepper: Step 1 Active */}
      <div style={{ maxWidth: "var(--content-max)", margin: "12px auto 0 auto", padding: "0 24px", width: "100%" }}>
        <WorkflowStepper currentStep={1} />
      </div>

      {/* Core Clinical Workspace Section */}
      <main className="solo" ref={workspaceRef}>
        <section className="card">
          {/* Active Domain Status Banner with Change Specialty trigger */}
          <div className="aimed-active-banner" style={{ marginBottom: "var(--space-5)", maxWidth: "var(--form-max)", width: "100%" }}>
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
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                data-testid="change-specialty"
                className="btn btn--secondary btn--sm"
                onClick={() => router.push("/")}
                title="Return to specialty selection portal"
              >
                ← Change Specialty
              </button>
              <button
                ref={quickSwitchTriggerRef}
                type="button"
                id="btn-choose-speciality"
                data-testid="quick-switch"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  setIsSourcesModalOpen(false);
                  setIsSpecialtyModalOpen(true);
                }}
              >
                🏥 Quick Switch ▾
              </button>
            </div>
          </div>

          <form onSubmit={start} className="aimed-form" style={{ width: "100%", maxWidth: "var(--form-max)" }}>
            {/* Presets Bar */}
            <div className="aimed-preset-strip">
              <h2 className="aimed-preset-heading">
                Start from an example
              </h2>
              <p className="aimed-preset-hint">
                Fills the keywords below — you can edit them.
              </p>
              <div className="preset-grid" data-testid="preset-grid" data-count={activePresets.length}>
                {activePresets.map((preset) => {
                  const isPressed = activePresetId === preset.id;
                  return (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      isActive={isPressed}
                      onClick={() => applyPreset(preset)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Keyword Input Area */}
            <div className="input-group" style={{ marginBottom: "var(--space-5)", maxWidth: "var(--form-max)", width: "100%" }}>
              <label htmlFor="raw-pico-input" style={{ fontWeight: 600, display: "block", marginBottom: "var(--space-2)", fontSize: "var(--fs-label)" }}>
                Clinical keywords (3 to 5 terms):
              </label>
              <textarea
                id="raw-pico-input"
                data-testid="keywords-input"
                className="aimed-textarea textarea"
                rows={3}
                placeholder={keywordsPlaceholderFor(currentSpecialty)}
                value={rawInput}
                onChange={(e) => {
                  setRawInput(e.target.value);
                  setSavedNotice(null);
                }}
                style={{ width: "100%", maxWidth: "var(--form-max)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-2)" }}>
                <span data-testid="keywords-helper" className={`count-hint ${canSubmit ? "ok" : hasAttemptedSubmit ? "warn" : "rest"}`} style={{ fontSize: "var(--fs-caption)" }}>
                  {countHint}
                </span>
                <span data-testid="keywords-counter" style={{ fontSize: "var(--fs-caption)", color: "var(--muted-2)" }}>
                  {words.length} / 5 terms
                </span>
              </div>
            </div>

            {/* Live Interactive PICO Role Chips Strip */}
            {picoWords.length > 0 && (
              <div className="aimed-chips-container" style={{ marginBottom: "var(--space-5)", padding: "var(--space-3) var(--space-4)", background: "var(--canvas)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", maxWidth: "var(--form-max)", width: "100%" }}>
                <div style={{ fontSize: "var(--fs-caption)", fontWeight: 600, color: "var(--muted)", marginBottom: "var(--space-2)" }}>
                  🏷️ Classified PICO Parameters:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {picoWords.map((pw, idx) => {
                    const cfg = ROLE_CONFIG[pw.role] || ROLE_CONFIG.other;
                    return (
                      <span
                        key={`${pw.word}-${idx}`}
                        data-testid="pico-chip"
                        data-role={pw.role}
                        className="aimed-role-chip"
                        style={{
                          background: cfg.bg,
                          border: `1px solid ${cfg.border}`,
                          color: cfg.text,
                          padding: "var(--space-1) var(--space-2)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "var(--fs-body-sm)",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "var(--space-2)"
                        }}
                      >
                        <span
                          style={{
                            background: cfg.badgeBg,
                            color: "#fff",
                            fontSize: "var(--fs-badge)",
                            fontWeight: 700,
                            padding: "2px 5px",
                            borderRadius: "var(--radius-sm)"
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
                            padding: "4px 6px",
                            minWidth: 24,
                            minHeight: 24,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: "var(--fs-body-sm)"
                          }}
                          title={`Remove ${pw.word}`}
                          aria-label={`Remove keyword ${pw.word}`}
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
                className="advisory notice notice--info"
                style={{
                  marginBottom: "var(--space-5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                  maxWidth: "var(--form-max)",
                  width: "100%"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span>✓</span>
                  <span>{savedNotice}</span>
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => router.push("/screen")}
                >
                  Continue to Screening →
                </button>
              </div>
            )}

            {/* Literature Search Databases Bar */}
            <div
              data-testid="db-list"
              style={{
                marginBottom: "var(--space-5)",
                padding: "var(--space-3) var(--space-4)",
                background: "var(--canvas)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "var(--space-2)",
                maxWidth: "var(--form-max)",
                width: "100%"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--fs-caption)", fontWeight: 700, color: "var(--ink-2)" }}>
                  📚 Search Databases:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
                  {SEARCH_SOURCE_OPTIONS.map((s) => (
                    <span key={s.id} className="tag">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                ref={sourcesTriggerRef}
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  setIsSpecialtyModalOpen(false);
                  setIsSourcesModalOpen(true);
                }}
              >
                View sources
              </button>
            </div>

            {/* Patient Privacy Notice */}
            <div style={{ marginBottom: "var(--space-5)", maxWidth: "var(--form-max)", width: "100%" }}>
              <PhiNotice />
            </div>

            <div className="row" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap", maxWidth: "var(--form-max)", width: "100%" }}>
              <button
                data-testid="save-and-screen"
                className="btn btn--primary btn--lg"
                onClick={start}
                type="submit"
                disabled={!canSubmit}
              >
                Save words & Screen literature →
              </button>
              {(rawInput || picoWords.length > 0) && (
                <button
                  type="button"
                  data-testid="reset-words"
                  className="btn btn--ghost"
                  onClick={() => {
                    resetSession();
                    setRawInput("");
                    setSavedNotice(null);
                  }}
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
      <Modal
        isOpen={isSpecialtyModalOpen}
        onClose={() => setIsSpecialtyModalOpen(false)}
        title="🏥 Choose Clinical Specialty Domain"
        titleId="specialty-modal-title"
        triggerRef={quickSwitchTriggerRef}
        footer={
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setIsSpecialtyModalOpen(false)}
          >
            Close
          </button>
        }
      >
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
      </Modal>

      {/* Sources Config Dialog Modal */}
      <Modal
        isOpen={isSourcesModalOpen}
        onClose={() => setIsSourcesModalOpen(false)}
        title={`📚 Literature Search Sources (${SEARCH_SOURCE_OPTIONS.length} Databases)`}
        titleId="sources-modal-title"
        triggerRef={sourcesTriggerRef}
        maxWidth={640}
        footer={
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setIsSourcesModalOpen(false)}
          >
            Done
          </button>
        }
      >
        <p style={{ fontSize: "var(--fs-body-sm)", color: "var(--muted)", marginBottom: "var(--space-3)" }}>
          All authoritative literature search engines are actively queried in parallel with deduplication:
        </p>
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          {SEARCH_SOURCE_OPTIONS.map((src) => (
            <div
              key={src.id}
              style={{
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                background: "var(--canvas)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-3)"
              }}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: "var(--fs-body-sm)", color: "var(--ink)" }}>{src.name}</span>
                <span style={{ fontSize: "var(--fs-caption)", color: "var(--muted)", marginLeft: "var(--space-2)" }}>{src.provider}</span>
                <div style={{ fontSize: "var(--fs-caption)", color: "var(--muted)" }}>{src.description}</div>
              </div>
              <span className="badge badge--success">Active</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
