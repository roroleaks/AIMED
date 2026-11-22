"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAimedContext } from "@/context/AimedContext";
import { SPECIALTIES } from "@/lib/specialties";
import { APP_VERSION } from "@/lib/version";
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
            <h1>Multi-Specialty Clinical Intelligence Portal</h1>
            <p>From Clinical Uncertainty to Evidence-Grounded Answerable Questions</p>
          </div>
          <AuthorHeaderRight />
        </div>
      </header>

      {/* Hero Welcome Banner */}
      <section className="aimed-hero" style={{ padding: "32px 20px 24px 20px", textAlign: "center" }}>
        <div className="aimed-badge" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <span>🩺 15 Medical Disciplines · Zero-Hallucination Retrieval</span>
        </div>
        <h2 className="aimed-hero-title" style={{ fontSize: "2rem", fontWeight: 800, marginBottom: 10, color: "#0f172a" }}>
          Select Your Clinical <span>Specialty Domain</span>
        </h2>
        <p className="aimed-hero-subtitle" style={{ maxWidth: 780, margin: "0 auto", fontSize: "1.02rem", color: "#475569", lineHeight: 1.6 }}>
          Calibrated PICO formulation, multi-source literature retrieval across 8 biomedical repositories, and publication-grade narrative evidence synthesis.
        </p>
      </section>

      {/* Primary Selection Section: Dropdown Menu & QR Code */}
      <main className="solo" style={{ maxWidth: 1280, margin: "0 auto 36px auto", padding: "0 20px" }}>
        <section
          className="card"
          style={{
            marginBottom: 24,
            padding: "24px 28px",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            boxShadow: "0 8px 30px rgba(15, 118, 110, 0.06)"
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 28,
              alignItems: "center"
            }}
          >
            {/* Left Column: Dropdown Selection & Featured Domain Summary */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: "1.1rem" }}>🏥</span>
                <label
                  htmlFor="specialty-dropdown-select"
                  style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}
                >
                  Choose Specialty from Menu:
                </label>
              </div>

              {/* Styled Dropdown Menu */}
              <div style={{ position: "relative", marginBottom: 18 }}>
                <select
                  id="specialty-dropdown-select"
                  value={selectedId}
                  onChange={(e) => handleDropdownChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "13px 18px",
                    fontSize: "1.02rem",
                    fontWeight: 600,
                    color: "#0f172a",
                    background: "#ffffff",
                    border: "2px solid #0f766e",
                    borderRadius: 10,
                    cursor: "pointer",
                    outline: "none",
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
                  background: "#ffffff",
                  border: "1px solid #ccfbf1",
                  borderRadius: 10,
                  padding: "16px 18px",
                  boxShadow: "0 2px 10px rgba(15, 118, 110, 0.05)",
                  marginBottom: 18
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "1.8rem" }}>{activeSpecialtyDef.icon}</span>
                    <div>
                      <div style={{ fontSize: "1.12rem", fontWeight: 700, color: "#0f766e" }}>
                        {activeSpecialtyDef.label}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        Category: <b>{activeSpecialtyDef.category}</b>
                      </div>
                    </div>
                  </div>
                  <span
                    className="pill"
                    style={{
                      background: "#f0fdfa",
                      color: "#0d9488",
                      border: "1px solid #99f6e4",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      padding: "4px 10px"
                    }}
                  >
                    🏛️ {activeSpecialtyDef.authorityGuidelines}
                  </span>
                </div>

                <p style={{ fontSize: "0.88rem", color: "#334155", margin: "6px 0 10px 0", lineHeight: 1.5 }}>
                  {activeSpecialtyDef.description}
                </p>

                <div style={{ fontSize: "0.82rem", color: "#475569", marginBottom: 6 }}>
                  <b>Key Conditions:</b> {activeSpecialtyDef.conditions.slice(0, 4).join(", ")}
                </div>
                <div style={{ fontSize: "0.82rem", color: "#475569" }}>
                  <b>Prioritized Outcomes:</b> {activeSpecialtyDef.outcomesRanked?.slice(0, 3).join(", ") || "Clinical endpoints"}
                </div>
              </div>

              {/* Big CTA Button to Dashboard */}
              <button
                type="button"
                id="btn-go-to-dashboard"
                onClick={() => handleProceedToDashboard()}
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  background: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: "1.08rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: "0 4px 16px rgba(15, 118, 110, 0.35)",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease"
                }}
              >
                <span>Proceed to Clinical Dashboard ({activeSpecialtyDef.shortName})</span>
                <span style={{ fontSize: "1.2rem" }}>→</span>
              </button>
            </div>

            {/* Right Column: QR Code Component & Mobile Access Card */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 24px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.03)"
              }}
            >
              <AppQrCode url="https://aimed-pico.vercel.app" size={145} />
              <div style={{ marginTop: 14, textAlign: "center", maxWidth: 280 }}>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                  Cross-Device Synchronized
                </div>
                <p style={{ fontSize: "0.78rem", color: "#64748b", margin: 0, lineHeight: 1.45 }}>
                  Scan with your phone or tablet camera to access AIMed anywhere in your clinic or hospital network.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Visual Specialties Browser Section */}
        <section className="card" style={{ padding: "24px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: "1.18rem", fontWeight: 700, color: "#0f172a", margin: "0 0 4px 0" }}>
                Browse All 15 Clinical Specialties
              </h3>
              <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>
                Click any specialty card below to set your clinical domain and enter the PICO workbench.
              </p>
            </div>

            {/* Search Input Filter */}
            <div style={{ minWidth: 260, maxWidth: 360, width: "100%" }}>
              <input
                type="text"
                placeholder="Search specialty, guideline, or condition..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem"
                }}
              />
            </div>
          </div>

          {/* Category Tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 20,
                    border: isSelected ? "1px solid #0f766e" : "1px solid #e2e8f0",
                    background: isSelected ? "#0f766e" : "#f8fafc",
                    color: isSelected ? "#ffffff" : "#475569",
                    fontSize: "0.8rem",
                    fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease"
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
              gap: 16
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
                    padding: "16px 18px",
                    background: isCurrent ? "#f0fdfa" : "#ffffff",
                    border: isCurrent ? "2px solid #0f766e" : "1px solid #e2e8f0",
                    borderRadius: 10,
                    cursor: "pointer",
                    boxShadow: isCurrent
                      ? "0 4px 14px rgba(15, 118, 110, 0.15)"
                      : "0 2px 6px rgba(0, 0, 0, 0.02)",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: "1.6rem" }}>{s.icon}</span>
                      <span
                        className="pill"
                        style={{
                          fontSize: "0.72rem",
                          background: isCurrent ? "#0f766e" : "#f1f5f9",
                          color: isCurrent ? "#ffffff" : "#475569",
                          fontWeight: 600
                        }}
                      >
                        {s.category}
                      </span>
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: isCurrent ? "#0f766e" : "#1e293b", marginBottom: 4 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 8 }}>
                      🏛️ {s.authorityGuidelines}
                    </div>
                    <p style={{ fontSize: "0.8rem", color: "#475569", margin: "0 0 12px 0", lineHeight: 1.45 }}>
                      {s.description.slice(0, 95)}…
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProceedToDashboard(s.id);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: isCurrent ? "#0f766e" : "#f8fafc",
                      color: isCurrent ? "#ffffff" : "#0f766e",
                      border: isCurrent ? "none" : "1px solid #ccfbf1",
                      borderRadius: 6,
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6
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
