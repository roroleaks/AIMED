"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { SPECIALTIES, SPECIALTY_CATEGORIES, getSpecialtyDefinition, type SpecialtyDefinition, type PicoPreset } from "@/lib/specialties";
import { sget, sset, KEYS } from "@/lib/session";
import type { SpecialtyKey } from "@/lib/kb";

interface AimedContextValue {
  specialty: string;
  setSpecialty: (id: string) => void;
  currentSpecialty: SpecialtyDefinition;
  allSpecialties: SpecialtyDefinition[];
  categories: readonly string[];
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filteredSpecialties: SpecialtyDefinition[];
  activePresets: PicoPreset[];
}

const AimedContext = createContext<AimedContextValue | null>(null);

export function AimedProvider({ children }: { children: React.ReactNode }) {
  const [specialty, setSpecialtyState] = useState<string>("obgyn");
  const [selectedCategory, setSelectedCategory] = useState<string>("All Specialties");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Initialize from sessionStorage on client mount
  useEffect(() => {
    try {
      const stored = sget<string>(KEYS.specialty);
      if (stored && (stored in SPECIALTIES || stored === "infertility" || stored === "gynecology" || stored === "obstetrics")) {
        const canonical = stored === "infertility" || stored === "gynecology" || stored === "obstetrics" ? "obgyn" : stored;
        setSpecialtyState(canonical);
      }
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  const setSpecialty = useCallback((id: string) => {
    const canonical = (id === "infertility" || id === "gynecology" || id === "obstetrics") ? "obgyn" : id;
    setSpecialtyState(canonical);
    sset(KEYS.specialty, canonical);
  }, []);

  const currentSpecialty = useMemo(() => getSpecialtyDefinition(specialty), [specialty]);

  const allSpecialties = useMemo(() => Object.values(SPECIALTIES), []);

  const filteredSpecialties = useMemo(() => {
    return allSpecialties.filter(s => {
      const matchesCategory = selectedCategory === "All Specialties" || s.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        s.label.toLowerCase().includes(q) ||
        s.shortName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.authorityGuidelines.toLowerCase().includes(q) ||
        s.conditions.some(c => c.toLowerCase().includes(q)) ||
        s.interventions.some(i => i.toLowerCase().includes(q)) ||
        s.terminology.some(t => t.toLowerCase().includes(q))
      );
    });
  }, [allSpecialties, selectedCategory, searchQuery]);

  const activePresets = useMemo(() => currentSpecialty.presets, [currentSpecialty]);

  const value = useMemo(
    () => ({
      specialty,
      setSpecialty,
      currentSpecialty,
      allSpecialties,
      categories: SPECIALTY_CATEGORIES,
      selectedCategory,
      setSelectedCategory,
      searchQuery,
      setSearchQuery,
      filteredSpecialties,
      activePresets
    }),
    [specialty, setSpecialty, currentSpecialty, allSpecialties, selectedCategory, searchQuery, filteredSpecialties, activePresets]
  );

  return <AimedContext.Provider value={value}>{children}</AimedContext.Provider>;
}

export function useAimedContext(): AimedContextValue {
  const ctx = useContext(AimedContext);
  if (!ctx) {
    throw new Error("useAimedContext must be used within an AimedProvider");
  }
  return ctx;
}
