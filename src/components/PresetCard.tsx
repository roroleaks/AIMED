import React from "react";
import type { PicoPreset } from "@/lib/specialties";

// display helper — pure, no data mutation
export function splitPresetName(name: string): { condition: string; comparison: string } {
  const m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { condition: m[1].trim(), comparison: m[2].trim() } : { condition: name, comparison: "" };
}

/**
 * Display only: lets a long "A/B" term wrap after the slash. The text nodes stay whole words, so
 * no word is ever cut in half, and the preset data itself is never touched.
 */
function withSlashBreaks(text: string): React.ReactNode {
  const parts = text.split("/");
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {i > 0 && "/"}
      {i > 0 && <wbr />}
      {part}
    </React.Fragment>
  ));
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
                {withSlashBreaks(vsParts[0])}{" "}
                <span className="preset-vs">vs</span>{" "}
                {withSlashBreaks(vsParts[1])}
              </>
            ) : (
              withSlashBreaks(comparison)
            )}
          </div>
        )}
      </div>
    </button>
  );
}
