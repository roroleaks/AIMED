"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAimedContext } from "@/context/AimedContext";
import { SPECIALTIES } from "@/lib/specialties";
import { ALL_LITERATURE_SOURCES } from "@/lib/literature-sources";
import { AppFooter } from "@/components/AppFooter";
import { AuthorHeaderRight } from "@/components/AuthorHeaderRight";
import { AppQrCode } from "@/components/AppQrCode";

export default function Home() {
  const router = useRouter();
  const { specialty, setSpecialty, currentSpecialty, allSpecialties, categories, selectedCategory, setSelectedCategory, searchQuery, setSearchQuery, filteredSpecialties } = useAimedContext();
  const [selectedId, setSelectedId] = useState<string>(specialty || "obgyn");

  const activeSpecialtyDef = useMemo(() => {
    return SPECIALTIES[selectedId] || currentSpecialty;
  }, [selectedId, currentSpecialty]);

  const handleDropdownChange = (newId: string) => {
    setSelectedId(newId);
    setSpecialty(newId);
  };

  const handleProceedToDashboard = (specialtyToUse?: string) => {
    const id = specialtyToUse || selectedId;
    setSpecialty(id);
    router.push("/dashboard");
  };

  return (
    <div className="wrap">
      {/* Header */}
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
            <h1>Multi-Specialty Clinical Intelligence Portal</h1>
            <p>From Clinical Uncertainty to Evidence-Grounded Answerable Questions</p>
          </div>
          <AuthorHeaderRight />
        </div>
      </header>

      {/* Hero Welcome Banner */}
      <section className="aimed-hero" style={{ padding: "var(--space-6) var(--space-4) var(--space-5) var(--space-4)", textAlign: "center" }}>
        <div className="badge badge--neutral" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)", padding: "var(--space-1) var(--space-3)" }}>
          <span>🩺 Multi-source retrieval · draft output — verify before use</span>
        </div>
        <h2 className="aimed-hero-title" style={{ fontSize: "var(--fs-display)", fontWeight: 700, marginBottom: "var(--space-2)", color: "var(--ink)" }}>
          Select Your Clinical <span>Specialty Domain</span>
        </h2>
        <p className="aimed-hero-subtitle" style={{ maxWidth: "var(--reading-max)", margin: "0 auto", fontSize: "var(--fs-subsection)", color: "var(--muted)", lineHeight: "var(--lh-reading)" }}>
          Calibrated PICO formulation, multi-source literature retrieval across {ALL_LITERATURE_SOURCES.length} biomedical repositories, and publication-grade narrative evidence synthesis.
        </p>
      </section>

      {/* Primary Selection Section: Dropdown Menu & QR Code */}
      <main className="solo" style={{ maxWidth: "var(--content-max)", margin: "0 auto var(--space-6) auto", padding: "0 var(--space-4)" }}>
        <section
          className="card"
          style={{
            marginBottom: "var(--space-5)",
            padding: "var(--space-5)",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-1)"
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "var(--space-5)",
              alignItems: "center"
            }}
          >
            {/* Left Column: Dropdown Selection & Featured Domain Summary */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                <span style={{ fontSize: "var(--fs-subsection)" }}>🏥</span>
                <label
                  htmlFor="specialty-dropdown-select"
                  style={{ fontSize: "var(--fs-subsection)", fontWeight: 700, color: "var(--ink)" }}
                >
                  Choose Specialty from Menu:
                </label>
              </div>

              {/* Styled Dropdown Menu */}
              <div style={{ position: "relative", marginBottom: "var(--space-4)" }}>
                <select
                  id="specialty-dropdown-select"
                  className="select"
                  value={selectedId}
                  onChange={(e) => handleDropdownChange(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "var(--fs-body)",
                    fontWeight: 600,
                    color: "var(--ink)",
                    background: "var(--surface)",
                    border: "2px solid var(--accent)",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(15, 118, 110, 0.12)",
                    appearance: "auto"
                  }}
                >
                  {allSpecialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon} {s.label} ({s.shortName}) — {s.category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Specialty Detail Showcase Card */}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--accent-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-4)",
                  boxShadow: "0 2px 10px rgba(15, 118, 110, 0.05)",
                  marginBottom: "var(--space-4)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <span style={{ fontSize: "var(--fs-display)" }}>{activeSpecialtyDef.icon}</span>
                    <div>
                      <div style={{ fontSize: "var(--fs-subsection)", fontWeight: 700, color: "var(--accent)" }}>
                        {activeSpecialtyDef.label}
                      </div>
                      <div style={{ fontSize: "var(--fs-caption)", color: "var(--muted-2)" }}>
                        Category: <b>{activeSpecialtyDef.category}</b>
                      </div>
                    </div>
                  </div>
                  <span
                    className="pill"
                    style={{
                      background: "var(--accent-subtle)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent-border)",
                      fontSize: "var(--fs-badge)",
                      fontWeight: 700,
                      padding: "var(--space-1) var(--space-2)"
                    }}
                  >
                    🏛️ {activeSpecialtyDef.authorityGuidelines}
                  </span>
                </div>

                <p style={{ fontSize: "var(--fs-body-sm)", color: "var(--ink-2)", margin: "var(--space-2) 0", lineHeight: "var(--lh-reading)" }}>
                  {activeSpecialtyDef.description}
                </p>

                <div style={{ fontSize: "var(--fs-caption)", color: "var(--muted)", marginBottom: "var(--space-1)" }}>
                  <b>Key Conditions:</b> {activeSpecialtyDef.conditions.slice(0, 4).join(", ")}
                </div>
                <div style={{ fontSize: "var(--fs-caption)", color: "var(--muted)" }}>
                  <b>Prioritized Outcomes:</b> {activeSpecialtyDef.outcomesRanked?.slice(0, 3).join(", ") || "Clinical endpoints"}
                </div>
              </div>

              {/* Big CTA Button to Dashboard */}
              <button
                type="button"
                id="btn-go-to-dashboard"
                className="btn btn--primary"
                onClick={() => handleProceedToDashboard()}
                style={{
                  width: "100%",
                  height: "var(--control-lg)",
                  fontSize: "var(--fs-body)",
                  fontWeight: 700,
                  justifyContent: "center"
                }}
              >
                <span>Proceed to Clinical Dashboard ({activeSpecialtyDef.shortName})</span>
                <span style={{ fontSize: "var(--fs-section)" }}>→</span>
              </button>
            </div>

            {/* Right Column: QR Code Component & Mobile Access Card */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "var(--space-4)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-1)"
              }}
            >
              <AppQrCode url="https://aimed-pico.vercel.app" size={145} />
              <div style={{ marginTop: "var(--space-3)", textAlign: "center", maxWidth: 280 }}>
                <div style={{ fontSize: "var(--fs-body-sm)", fontWeight: 700, color: "var(--ink)", marginBottom: "var(--space-1)" }}>
                  Cross-Device Synchronized
                </div>
                <p style={{ fontSize: "var(--fs-caption)", color: "var(--muted-2)", margin: 0, lineHeight: "var(--lh-snug)" }}>
                  Scan with your phone or tablet camera to access AIMed anywhere in your clinic or hospital network.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Visual Specialties Browser Section */}
        <section className="card" style={{ padding: "var(--space-5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
            <div>
              <h3 style={{ fontSize: "var(--fs-section)", fontWeight: 700, color: "var(--ink)", margin: "0 0 var(--space-1) 0" }}>
                Browse All 15 Clinical Specialties
              </h3>
              <p style={{ fontSize: "var(--fs-body-sm)", color: "var(--muted)", margin: 0 }}>
                Click any specialty card below to set your clinical domain and enter the PICO workbench.
              </p>
            </div>

            {/* Search Input Filter */}
            <div style={{ minWidth: 260, maxWidth: 360, width: "100%" }}>
              <input
                type="text"
                className="input"
                placeholder="Search specialty, guideline, or condition..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "var(--fs-body-sm)",
                  minHeight: "var(--control-md)"
                }}
              />
            </div>
          </div>

          {/* Category Tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-5)" }}>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  className="chip"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    background: isSelected ? "var(--accent)" : "var(--canvas)",
                    color: isSelected ? "#ffffff" : "var(--muted)",
                    borderColor: isSelected ? "var(--accent)" : "var(--border)",
                    fontWeight: isSelected ? 700 : 500,
                    minHeight: "36px",
                    cursor: "pointer"
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Specialty Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "var(--space-4)"
            }}
          >
            {filteredSpecialties.map((s) => {
              const isCurrent = selectedId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    handleDropdownChange(s.id);
                  }}
                  style={{
                    padding: "var(--space-4)",
                    background: isCurrent ? "var(--accent-subtle)" : "var(--surface)",
                    border: isCurrent ? "2px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    boxShadow: isCurrent
                      ? "0 4px 14px rgba(15, 118, 110, 0.15)"
                      : "var(--shadow-1)",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                      <span style={{ fontSize: "var(--fs-display)" }}>{s.icon}</span>
                      <span
                        className="badge"
                        style={{
                          background: isCurrent ? "var(--accent)" : "var(--canvas)",
                          color: isCurrent ? "#ffffff" : "var(--muted)",
                          fontWeight: 600
                        }}
                      >
                        {s.category}
                      </span>
                    </div>
                    <div style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: isCurrent ? "var(--accent)" : "var(--ink)", marginBottom: "var(--space-1)" }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: "var(--fs-caption)", color: "var(--muted-2)", marginBottom: "var(--space-2)" }}>
                      🏛️ {s.authorityGuidelines}
                    </div>
                    <p style={{ fontSize: "var(--fs-caption)", color: "var(--muted)", margin: "0 0 var(--space-3) 0", lineHeight: "var(--lh-snug)" }}>
                      {s.description.slice(0, 95)}…
                    </p>
                  </div>

                  <button
                    type="button"
                    className={isCurrent ? "btn btn--primary" : "btn btn--secondary"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProceedToDashboard(s.id);
                    }}
                    style={{
                      width: "100%",
                      height: "var(--control-sm)",
                      fontSize: "var(--fs-caption)",
                      fontWeight: 700,
                      justifyContent: "center"
                    }}
                  >
                    <span>{isCurrent ? "Enter Dashboard" : "Select & Enter"}</span>
                    <span>→</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
