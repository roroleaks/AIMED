"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { sset, KEYS } from "@/lib/session";
import {
  parseInput,
  toSessionInput,
  sessionSearchText,
  validateKeywords,
  keywordCountHint,
  resolveCorrections,
  correctionKey,
  readSessionInput
} from "@/lib/clinical-input";
import type { KeywordCorrection, CorrectionRecord } from "@/lib/clinical-input";
import type { ClinicalInput } from "@/lib/clinical-input";
import { parseClinicalScenario } from "@/lib/clinical-semantics";
import { useAimedContext } from "@/context/AimedContext";
import { SpecialtySelector } from "@/components/SpecialtySelector";
import type { PicoPreset } from "@/lib/specialties";
import type { SpecialtyKey } from "@/lib/kb";

// sessionStorage is browser-only, so it cannot be read while rendering on the server.
let cachedRaw: string | null = null;
let cachedValue: ClinicalInput | null = null;
function sessionInputSnapshot(): ClinicalInput | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEYS.input);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedValue = raw ? readSessionInput(JSON.parse(raw)) : null;
    } catch {
      cachedValue = raw ? readSessionInput(raw) : null;
    }
  }
  return cachedValue;
}
const serverSnapshot = (): null => null;
const serverModeSnapshot = (): "gap" => "gap";
const subscribeToNothing = () => () => {};
const EMPTY_DECISIONS: CorrectionRecord[] = [];

let cachedModeRaw: string | null = null;
let cachedModeValue: "formulate" | "gap" = "gap";
function sessionModeSnapshot(): "formulate" | "gap" {
  if (typeof window === "undefined") return "gap";
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEYS.mode);
  } catch {
    raw = null;
  }
  if (raw !== cachedModeRaw) {
    cachedModeRaw = raw;
    cachedModeValue = raw === "formulate" ? "formulate" : "gap";
  }
  return cachedModeValue;
}

export default function Home() {
  const router = useRouter();
  const { specialty, setSpecialty, currentSpecialty, activePresets } = useAimedContext();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);

  const restored = useSyncExternalStore(subscribeToNothing, sessionInputSnapshot, serverSnapshot);
  const restoredMode = useSyncExternalStore(subscribeToNothing, sessionModeSnapshot, serverModeSnapshot);

  const [draft, setDraft] = useState<string | null>(null);
  const input = draft ?? restored?.rawInput ?? "";
  const setInput = useCallback((v: string) => setDraft(v), []);
  const [modeDraft, setModeDraft] = useState<"formulate" | "gap" | null>(null);
  const mode = modeDraft ?? restoredMode;
  const setMode = useCallback((v: "formulate" | "gap") => setModeDraft(v), []);
  const [tagError, setTagError] = useState<string | null>(null);

  // Input style: Quick tag words (free-text) vs Structured labeled fields (P, I, C, O)
  const [entryStyle, setEntryStyle] = useState<"tags" | "structured">("tags");

  // Structured fields state
  const [structP, setStructP] = useState("");
  const [structI, setStructI] = useState("");
  const [structC, setStructC] = useState("");
  const [structO, setStructO] = useState("");

  const [decided, setDecided] = useState<CorrectionRecord[] | null>(null);
  const decisions = useMemo(
    () => decided ?? restored?.corrections ?? EMPTY_DECISIONS,
    [decided, restored]
  );

  // Validate as the user types
  const parsed = useMemo(
    () => resolveCorrections(parseInput(input), decisions),
    [input, decisions]
  );

  const structuredValidationError = useMemo(() => {
    if (entryStyle !== "structured") return null;
    if (!structP.trim()) return "Please enter the Population / Clinical Problem (P).";
    if (!structI.trim()) return "Please enter the Intervention / Therapy (I).";
    if (!structC.trim() && !structO.trim()) {
      return "Please specify a Comparator / Control (C) or a Target Outcome (O) (or both).";
    }
    if (parsed.logicalCount > 6) {
      return `${parsed.logicalCount} keywords detected — maximum is 6.`;
    }
    return null;
  }, [entryStyle, structP, structI, structC, structO, parsed.logicalCount]);

  const countHint = useMemo(() => {
    if (entryStyle === "structured") {
      const filled = [structP, structI, structC, structO].filter(s => s.trim().length > 0).length;
      if (filled === 0) return "";
      if (!structP.trim() || !structI.trim()) {
        return `${filled} structured field${filled === 1 ? "" : "s"} entered — Population (P) and Intervention (I) are required.`;
      }
      return `${filled} structured PICO field${filled === 1 ? "" : "s"} entered.`;
    }
    return keywordCountHint(parsed);
  }, [entryStyle, structP, structI, structC, structO, parsed]);

  const validationMessage = entryStyle === "structured" ? structuredValidationError : validateKeywords(parsed);
  const canSubmit = validationMessage === null;

  const liveMessage = input.trim() ? validationMessage : null;
  const alertMessage = tagError || liveMessage;

  // Real-time clinical semantic parsing contextualized with active specialty
  const liveScenario = useMemo(() => {
    if (!input.trim() || input.trim().length < 4) return null;
    try {
      return parseClinicalScenario(input, specialty as SpecialtyKey);
    } catch {
      return null;
    }
  }, [input, specialty]);

  const applyPreset = (preset: PicoPreset) => {
    setStructP(preset.p);
    setStructI(preset.i);
    setStructC(preset.c);
    setStructO(preset.o);
    setInput(preset.raw);
    setTagError(null);
    if (workspaceRef.current) {
      workspaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSelectSpecialtyFromCard = (id: string) => {
    setSpecialty(id);
    if (workspaceRef.current) {
      workspaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSelectPresetFromCard = (preset: PicoPreset) => {
    applyPreset(preset);
  };

  const scrollToSelector = () => {
    if (selectorRef.current) {
      selectorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleStructuredChange = (field: "p" | "i" | "c" | "o", val: string) => {
    const nextP = field === "p" ? val : structP;
    const nextI = field === "i" ? val : structI;
    const nextC = field === "c" ? val : structC;
    const nextO = field === "o" ? val : structO;

    if (field === "p") setStructP(val);
    if (field === "i") setStructI(val);
    if (field === "c") setStructC(val);
    if (field === "o") setStructO(val);

    const parts = [nextP, nextI, nextC, nextO].map(s => s.trim()).filter(Boolean);
    setInput(parts.join(", "));
    setTagError(null);
  };

  const switchToStructured = () => {
    if (liveScenario && (!structP && !structI)) {
      setStructP(liveScenario.population);
      setStructI(liveScenario.intervention);
      setStructC(liveScenario.comparator);
      setStructO(liveScenario.outcomes[0] || "");
    }
    setEntryStyle("structured");
  };

  const decide = (c: KeywordCorrection, decision: CorrectionRecord["decision"]) => {
    const key = correctionKey(c);
    const record: CorrectionRecord = { ...c, decision };
    const at = decisions.findIndex(p => correctionKey(p) === key);
    const next = at >= 0 ? decisions.map(p => (correctionKey(p) === key ? record : p)) : [...decisions, record];
    setDecided(next);
    const current = resolveCorrections(parseInput(input), next);
    sset(KEYS.input, toSessionInput(current, input));
    sset(KEYS.inputText, sessionSearchText(toSessionInput(current, input)));
    setTagError(null);
  };

  const start = () => {
    const current = resolveCorrections(parseInput(input), decisions);
    const err = entryStyle === "structured" ? structuredValidationError : validateKeywords(current);
    if (err) { setTagError(err); return; }
    setTagError(null);
    sset(KEYS.specialty, specialty);
    sset(KEYS.input, toSessionInput(current, input));
    sset(KEYS.inputText, sessionSearchText(toSessionInput(current, input)));
    sset(KEYS.mode, mode);
    router.push("/gap");
  };

  return (
    <div className="wrap">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-left">
            <svg className="lens-icon" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
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

      {/* Medical Specialty Selector Section */}
      <section ref={selectorRef} className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
              🏥 Step 1 · Choose Clinical Domain
            </h3>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              Select a specialty to calibrate PICO ontology and guideline-backed parameters
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#0f766e" }}>
              Active: {currentSpecialty.icon} {currentSpecialty.shortName}
            </span>
          </div>
        </div>

        <SpecialtySelector
          onSelectSpecialty={handleSelectSpecialtyFromCard}
          onSelectPreset={handleSelectPresetFromCard}
        />
      </section>

      {/* Core Clinical Workspace Section */}
      <main className="solo" ref={workspaceRef}>
        <section className="card">
          {/* Active Domain Status Banner */}
          <div className="aimed-active-banner">
            <div className="aimed-banner-left">
              <span className="aimed-banner-icon">{currentSpecialty.icon}</span>
              <div>
                <div className="aimed-banner-title">
                  Active Domain: {currentSpecialty.label}
                </div>
                <div className="aimed-banner-sub">
                  Practice Guidelines: <b>{currentSpecialty.authorityGuidelines}</b> · Category: <b>{currentSpecialty.category}</b>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="mini-btn"
              onClick={scrollToSelector}
              style={{ background: "#ffffff", border: "1px solid #99f6e4", color: "#0f766e" }}
            >
              🔄 Change Specialty
            </button>
          </div>

          {/* 4-Step Pipeline Workflow Indicator */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 20 }}>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f0fdfa", border: "1.5px solid #0f766e" }}>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#0f766e", textTransform: "uppercase" }}>Step 1 · Active</span>
              <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>Domain & 4–6 Tag Words</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Step 2</span>
              <div style={{ fontSize: "0.86rem", fontWeight: 600, color: "#334155" }}>Evidence Map & 4 PICOs</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Step 3</span>
              <div style={{ fontSize: "0.86rem", fontWeight: 600, color: "#334155" }}>Select 1 of 4–6 Outcomes</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Step 4</span>
              <div style={{ fontSize: "0.86rem", fontWeight: 600, color: "#334155" }}>Commentary & Dual PDFs</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <span className="pill">📝 Step 1 · Clinical Keywords ({currentSpecialty.shortName})</span>
            <div style={{ display: "flex", gap: 6, background: "#f1f5f9", padding: 3, borderRadius: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setEntryStyle("tags")}
                style={{
                  border: "none",
                  padding: "5px 12px",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  borderRadius: 6,
                  cursor: "pointer",
                  background: entryStyle === "tags" ? "var(--accent)" : "transparent",
                  color: entryStyle === "tags" ? "#fff" : "var(--muted)"
                }}
              >
                ⚡ Quick Tag Words
              </button>
              <button
                type="button"
                onClick={switchToStructured}
                style={{
                  border: "none",
                  padding: "5px 12px",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  borderRadius: 6,
                  cursor: "pointer",
                  background: entryStyle === "structured" ? "var(--accent)" : "transparent",
                  color: entryStyle === "structured" ? "#fff" : "var(--muted)"
                }}
              >
                🏷️ Structured PICO Fields
              </button>
            </div>
          </div>

          {entryStyle === "tags" ? (
            <>
              <p className="hint">
                Enter 4–6 clinically meaningful keywords or phrases for <b>{currentSpecialty.label}</b>. Separate terms with commas, semicolons, or new lines.
              </p>
              <textarea
                aria-label="Clinical keywords"
                value={input}
                onChange={(e) => { setInput(e.target.value); setTagError(null); }}
                placeholder={
                  activePresets.length > 0
                    ? `e.g., ${activePresets[0].raw}`
                    : "e.g., population, intervention, comparator, clinical outcome"
                }
                rows={4}
              />
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
              <p className="hint" style={{ marginBottom: 4 }}>
                Enter explicit clinical terms for each PICO element in <b>{currentSpecialty.label}</b>. The system maps literature across PubMed and medical databases.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: 4 }}>
                    👥 Population / Clinical Problem (P):
                  </label>
                  <input
                    type="text"
                    className="free-input"
                    value={structP}
                    onChange={(e) => handleStructuredChange("p", e.target.value)}
                    placeholder={activePresets[0]?.p || "e.g., patients with clinical condition"}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: 4 }}>
                    💊 Intervention / Therapy (I):
                  </label>
                  <input
                    type="text"
                    className="free-input"
                    value={structI}
                    onChange={(e) => handleStructuredChange("i", e.target.value)}
                    placeholder={activePresets[0]?.i || "e.g., evaluated intervention or therapy"}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: 4 }}>
                    ⚖️ Comparator / Control (C):
                  </label>
                  <input
                    type="text"
                    className="free-input"
                    value={structC}
                    onChange={(e) => handleStructuredChange("c", e.target.value)}
                    placeholder={activePresets[0]?.c || "e.g., active comparator or standard care"}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: 4 }}>
                    🎯 Target Outcome (O):
                  </label>
                  <input
                    type="text"
                    className="free-input"
                    value={structO}
                    onChange={(e) => handleStructuredChange("o", e.target.value)}
                    placeholder={activePresets[0]?.o || "e.g., primary clinical endpoint"}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Quick Presets tailored to active specialty */}
          {activePresets.length > 0 && (
            <div style={{ marginTop: 8, marginBottom: 12 }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                💡 Quick Presets for {currentSpecialty.shortName}:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {activePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="mini-btn"
                    style={{ background: "#f8fafc", color: "var(--ink)", border: "1px solid var(--border)" }}
                    onClick={() => applyPreset(preset)}
                    title={preset.description}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Real-time PICO Classification Badge Card */}
          {liveScenario && (
            <div style={{ marginTop: 12, padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  ✓ Live PICO Classification Detected
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  Domain: <b style={{ textTransform: "capitalize" }}>{currentSpecialty.label}</b>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                <div style={{ background: "#fff", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e293b", display: "block" }}>👥 Population (P):</span>
                  <span style={{ fontSize: "0.85rem", color: "#0f766e", fontWeight: 600 }}>{liveScenario.population}</span>
                </div>
                <div style={{ background: "#fff", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e293b", display: "block" }}>💊 Intervention (I):</span>
                  <span style={{ fontSize: "0.85rem", color: "#0f766e", fontWeight: 600 }}>{liveScenario.intervention}</span>
                </div>
                <div style={{ background: "#fff", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e293b", display: "block" }}>⚖️ Comparator (C):</span>
                  <span style={{ fontSize: "0.85rem", color: "#0f766e", fontWeight: 600 }}>{liveScenario.comparator}</span>
                </div>
                <div style={{ background: "#fff", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e293b", display: "block" }}>🎯 Target Outcome (O):</span>
                  <span style={{ fontSize: "0.85rem", color: "#0f766e", fontWeight: 600 }}>{liveScenario.outcomes[0] || "clinical outcome"}</span>
                </div>
              </div>
            </div>
          )}

          {countHint && (
            <p className={`count-hint${!canSubmit ? " count-bad" : " count-ok"}`} aria-live="polite">{countHint}</p>
          )}

          {parsed.corrections.length > 0 && (
            <div className="advisory" role="status" aria-live="polite" style={{ marginTop: 10 }}>
              {parsed.corrections.map(c => (
                <div key={`${c.from}-${c.to}`} className="correction-row">
                  <span>Suggested correction: “{c.from}” → “{c.to}”. Apply correction?</span>
                  <span className="row" style={{ marginTop: 6 }}>
                    <button className="mini-btn" onClick={() => decide(c, "applied")}>Apply</button>
                    <button className="mini-btn" onClick={() => decide(c, "kept")}>Keep “{c.from}”</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {alertMessage && (
            <div className="advisory" role="alert" aria-live="polite" style={{ marginTop: 10 }}>⚠️ {alertMessage}</div>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <button className="primary" onClick={start} disabled={!input.trim() || !canSubmit} style={{ padding: "12px 28px", fontSize: "1rem" }}>
              🔍 Search Literature & Map Evidence (Step 2) ➜
            </button>
          </div>
        </section>
      </main>

      <footer>
        Aimed v4.0 — Multi-Specialty Clinical Intelligence Platform · Educational & Research Decision Support: always verify formulated questions clinically.<br />
        Copyright©RaoufRoshdy2026
      </footer>
    </div>
  );
}