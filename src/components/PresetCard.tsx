import React from "react";
import type { PicoPreset } from "@/lib/specialties";

// display helper — pure, no data mutation
export function splitPresetName(name: string): { condition: string; comparison: string } {
  const m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { condition: m[1].trim(), comparison: m[2].trim() } : { condition: name, comparison: "" };
}

export interface PresetCardProps {
  preset: PicoPreset;
  isActive?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export function PresetCard({ preset, isActive = false, onClick, className = "" }: PresetCardProps) {
  const { condition, comparison } = splitPresetName(preset.name);
  const vsParts = comparison.split(/\s+vs\.?\s+/i);

  return (
    <button
      type="button"
      data-testid="preset-card"
      data-preset-id={preset.id}
      className={`preset-card ${isActive ? "active" : ""} ${className}`.trim()}
      aria-pressed={isActive}
      aria-label={preset.name}
      title={preset.description || preset.name}
      onClick={onClick}
    >
      <span className="preset-card__icon" aria-hidden="true" style={{ color: "var(--accent)", fontSize: "16px", lineHeight: "1.2" }}>
        ⚡
      </span>
      <div className="preset-card__content">
        <div className="preset-card__condition">{condition}</div>
        {comparison && (
          <div className="preset-card__comparison">
            {vsParts.length === 2 ? (
              <>
                {vsParts[0]}
                <span className="preset-vs">vs</span>
                {vsParts[1]}
              </>
            ) : (
              comparison
            )}
          </div>
        )}
      </div>
    </button>
  );
}
