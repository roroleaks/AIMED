import { SPECIALTIES, type SpecialtyDefinition, type PicoPreset } from "../../src/lib/specialties.ts";

export const ALL_SPECIALTY_IDS = Object.keys(SPECIALTIES);
export const ALL_SPECIALTIES: SpecialtyDefinition[] = Object.values(SPECIALTIES);

export interface SpecialtyPresetEntry {
  specialtyId: string;
  specialtyLabel: string;
  preset: PicoPreset;
}

export const ALL_PRESETS: SpecialtyPresetEntry[] = ALL_SPECIALTIES.flatMap((s) =>
  s.presets.map((preset) => ({
    specialtyId: s.id,
    specialtyLabel: s.label,
    preset,
  }))
);

export function getPresetsForSpecialty(specialtyId: string): PicoPreset[] {
  return SPECIALTIES[specialtyId]?.presets ?? [];
}
