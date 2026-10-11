"use client";

import React, { useState } from "react";
import { useAimedContext } from "@/context/AimedContext";
import type { SpecialtyDefinition, PicoPreset } from "@/lib/specialties";

interface SpecialtySelectorProps {
  onSelectSpecialty?: (specialtyId: string) => void;
  onSelectPreset?: (preset: PicoPreset) => void;
  compact?: boolean;
}

export function SpecialtySelector({ onSelectSpecialty, onSelectPreset, compact = false }: SpecialtySelectorProps) {
  const {
    specialty,
    setSpecialty,
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filteredSpecialties
  } = useAimedContext();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCardClick = (s: SpecialtyDefinition) => {
    setSpecialty(s.id);
    if (onSelectSpecialty) {
      onSelectSpecialty(s.id);
    }
  };

  const handlePresetClick = (e: React.MouseEvent, s: SpecialtyDefinition, preset: PicoPreset) => {
    e.stopPropagation();
    setSpecialty(s.id);
    if (onSelectPreset) {
      onSelectPreset(preset);
    } else if (onSelectSpecialty) {
      onSelectSpecialty(s.id);
    }
  };

  return (
    <div className="specialty-selector-container">
      {/* Search and Category Filter Toolbar */}
      <div className="specialty-toolbar">
        <div className="specialty-search-box">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="specialty-search-input"
            placeholder="Search specialty, clinical condition (e.g. Heart Failure, NSCLC, Appendicitis), or guideline..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="specialty-category-pills">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`category-pill ${selectedCategory === cat ? "active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Specialty Cards */}
      {filteredSpecialties.length === 0 ? (
        <div className="specialty-empty-state">
          <p>No medical specialties found matching “{searchQuery}”.</p>
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("All Specialties");
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className={`specialty-grid ${compact ? "compact" : ""}`}>
          {filteredSpecialties.map((s) => {
            const isSelected = specialty === s.id;
            const isExpanded = expandedId === s.id || isSelected;

            return (
              <div
                key={s.id}
                className={`specialty-card ${isSelected ? "selected" : ""}`}
                onClick={() => handleCardClick(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick(s);
                  }
                }}
              >
                <div className="specialty-card-header">
                  <div className="specialty-card-title-row">
                    <span className="specialty-icon">{s.icon}</span>
                    <div>
                      <h3 className="specialty-name">{s.label}</h3>
                      <span className="specialty-category-badge">{s.category}</span>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="specialty-active-badge">✓ Active</span>
                  )}
                </div>

                <p className="specialty-desc">{s.description}</p>

                <div className="specialty-guideline-badge">
                  <span className="guideline-label">Guidelines:</span> {s.authorityGuidelines}
                </div>

                {/* Quick Presets Showcase */}
                {s.presets.length > 0 && (
                  <div className="specialty-presets-wrap">
                    <span className="presets-heading">Clinical Presets:</span>
                    <div className="presets-list">
                      {s.presets.slice(0, 3).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="specialty-preset-pill"
                          onClick={(e) => handlePresetClick(e, s, p)}
                          title={`${p.name} — ${p.description}`}
                        >
                          ⚡ {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="specialty-card-footer">
                  <span className="specialty-launch-action">
                    {isSelected ? "Clinical Workspace Active →" : "Select & Open Workspace →"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SpecialtyHeaderDropdown() {
  const { specialty, setSpecialty, allSpecialties, currentSpecialty } = useAimedContext();
  const [open, setOpen] = useState(false);

  return (
    <div className="specialty-dropdown-container" style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="specialty-selector-header-btn"
        onClick={() => setOpen(!open)}
        title="Switch Medical Domain"
      >
        <span style={{ fontSize: "1.1rem" }}>{currentSpecialty.icon}</span>
        <span style={{ fontWeight: 600 }}>{currentSpecialty.shortName}</span>
        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 90 }}
            onClick={() => setOpen(false)}
          />
          <div className="specialty-dropdown-menu">
            <div className="specialty-dropdown-header">
              <span>Select Medical Specialty</span>
            </div>
            <div className="specialty-dropdown-list">
              {allSpecialties.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`specialty-dropdown-item ${specialty === s.id ? "active" : ""}`}
                  onClick={() => {
                    setSpecialty(s.id);
                    setOpen(false);
                  }}
                >
                  <span className="dropdown-item-icon">{s.icon}</span>
                  <div className="dropdown-item-info">
                    <span className="dropdown-item-title">{s.label}</span>
                    <span className="dropdown-item-meta">{s.authorityGuidelines}</span>
                  </div>
                  {specialty === s.id && <span className="dropdown-item-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
