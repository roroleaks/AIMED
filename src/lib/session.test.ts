import test from "node:test";
import assert from "node:assert/strict";
import {
  isMatchingScreenCache,
  isMatchingExploreCache,
  resetSession,
  KEYS,
  LEGACY_PURGE_KEYS,
  type ExcludedState
} from "./session.ts";

test("SES-1. KEYS catalog contains only active v4 session keys and inputText fallback", () => {
  // Specialty key must be aimed_specialty
  assert.equal(KEYS.specialty, "aimed_specialty");

  // Live input text fallback read on mount by intake
  assert.equal(KEYS.inputText, "cq_input_text");

  // v4 active session keys
  assert.equal(KEYS.picoWords, "cq_pico_words");
  assert.equal(KEYS.screen, "cq_screen");
  assert.equal(KEYS.choice, "cq_choice");
  assert.equal(KEYS.explore, "cq_explore");
  assert.equal(KEYS.excluded, "cq_excluded");
  assert.equal(KEYS.style, "cq_style");

  // Exact number of active keys
  assert.equal(Object.keys(KEYS).length, 8);

  // LEGACY_PURGE_KEYS list contains retired storage keys including real aimed_citation_style
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_input"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_input_text"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_mode"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_gap"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_question"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_formulation"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_commentary"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_outcomes"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_outcome"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("cq_citation_style"), true);
  assert.equal(LEGACY_PURGE_KEYS.includes("aimed_citation_style"), true);

  // aimed_specialty must NEVER be in LEGACY_PURGE_KEYS
  assert.equal((LEGACY_PURGE_KEYS as readonly string[]).includes("aimed_specialty"), false);
});

test("SES-2. isMatchingScreenCache validates matching cache, phrases, and specialty delta", () => {
  const cached = {
    specialty: "obgyn",
    inputWords: ["poor responders", "ivf", "growth hormone"],
    phrases: {
      established: { phrase: "PICO 1", basis: "Basis 1" },
      conflicting: { phrase: "PICO 2", basis: "Basis 2" },
      gap: { phrase: "PICO 3", basis: "Basis 3" }
    }
  };

  const words = [
    { word: "Poor Responders", role: "population" as const },
    { word: "IVF", role: "intervention" as const },
    { word: "growth hormone", role: "comparator" as const }
  ];

  // Matches when specialty and words align
  assert.equal(isMatchingScreenCache(cached, words, "obgyn"), true);
  assert.equal(isMatchingScreenCache(cached, ["poor responders", "ivf", "growth hormone"], "obgyn"), true);

  // AIMED delta: fails when specialty mismatches
  assert.equal(
    isMatchingScreenCache(cached, words, "cardiology"),
    false,
    "Screen cache must fail when current specialty does not match cached specialty"
  );

  // Fails when cached specialty is absent and currentSpecialty is specified
  const cachedNoSpecialty = {
    inputWords: ["poor responders", "ivf", "growth hormone"],
    phrases: {
      established: { phrase: "PICO 1", basis: "Basis 1" },
      conflicting: { phrase: "PICO 2", basis: "Basis 2" },
      gap: { phrase: "PICO 3", basis: "Basis 3" }
    }
  };
  assert.equal(isMatchingScreenCache(cachedNoSpecialty, words, "obgyn"), false);

  // Passes when currentSpecialty is omitted (backward compatibility)
  assert.equal(isMatchingScreenCache(cachedNoSpecialty, words), true);

  // Different words
  assert.equal(
    isMatchingScreenCache(cached, [
      { word: "endometriosis", role: "population" as const },
      { word: "ivf", role: "intervention" as const }
    ], "obgyn"),
    false
  );

  // Missing one phrase category
  const incompleteCached: Parameters<typeof isMatchingScreenCache>[0] = {
    specialty: "obgyn",
    inputWords: ["poor responders", "ivf", "growth hormone"],
    phrases: {
      established: { phrase: "PICO 1", basis: "Basis 1" },
      conflicting: { phrase: "PICO 2", basis: "Basis 2" }
    }
  };
  assert.equal(isMatchingScreenCache(incompleteCached, words, "obgyn"), false);

  // Null checks
  assert.equal(isMatchingScreenCache(null, words, "obgyn"), false);
  assert.equal(isMatchingScreenCache(cached, null, "obgyn"), false);
});

test("SES-3. isMatchingExploreCache validates matching phrase, category, and record array", () => {
  const cached = {
    phrase: "In poor responders (P), does ivf (I) compared with usual care (C) improve clinical pregnancy rate (O)?",
    category: "established",
    records: [{ title: "Study 1", pmid: "12345" }]
  };

  const choice = {
    phrase: "In poor responders (P), does ivf (I) compared with usual care (C) improve clinical pregnancy rate (O)?",
    category: "established"
  };

  assert.equal(isMatchingExploreCache(cached, choice), true);

  // Different category
  assert.equal(
    isMatchingExploreCache(cached, { ...choice, category: "conflicting" }),
    false
  );

  // Different phrase
  assert.equal(
    isMatchingExploreCache(cached, { ...choice, phrase: "Other phrase" }),
    false
  );

  // Non-array records
  assert.equal(
    isMatchingExploreCache({ ...cached, records: null as unknown as [] }, choice),
    false
  );

  // With excludedState
  const matchingExcluded: ExcludedState = {
    phrase: choice.phrase,
    category: choice.category,
    userExcluded: ["p1"],
    seen: ["p1"]
  };
  assert.equal(isMatchingExploreCache(cached, choice, matchingExcluded), true);

  const mismatchedExcluded: ExcludedState = {
    phrase: "Different phrase",
    category: choice.category,
    userExcluded: ["p1"],
    seen: ["p1"]
  };
  assert.equal(isMatchingExploreCache(cached, choice, mismatchedExcluded), false);

  // Nulls
  assert.equal(isMatchingExploreCache(null, choice), false);
  assert.equal(isMatchingExploreCache(cached, null), false);

  // With specialty matching (AIMED delta)
  const cachedWithSpecialty = {
    ...cached,
    specialty: "obgyn"
  };
  assert.equal(isMatchingExploreCache(cachedWithSpecialty, choice, undefined, "obgyn"), true);
  assert.equal(isMatchingExploreCache(cachedWithSpecialty, choice, undefined, "cardiology"), false);
});

test("SES-4. resetSession clears active and legacy keys but preserves aimed_specialty", () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear()
  };

  (globalThis as unknown as { window: { sessionStorage: typeof mockStorage } }).window = {
    sessionStorage: mockStorage
  };

  // Populate active, legacy, and specialty keys
  store.set(KEYS.specialty, JSON.stringify("obgyn"));
  store.set(KEYS.picoWords, JSON.stringify(["p1"]));
  store.set(KEYS.choice, JSON.stringify({ category: "established", phrase: "p" }));
  store.set(KEYS.screen, JSON.stringify({ data: 1 }));
  store.set("cq_mode", "pubmed");
  store.set("cq_outcomes", '["test"]');
  store.set("cq_gap", '{"data":1}');
  store.set("cq_question", "test question");
  store.set("cq_formulation", "test formulation");
  store.set("cq_commentary", "test commentary");
  store.set("cq_outcome", "test outcome");
  store.set("cq_citation_style", "vancouver");
  store.set("aimed_citation_style", "vancouver");

  assert.equal(store.size, 13);
  assert.equal(store.get(KEYS.specialty), JSON.stringify("obgyn"));

  resetSession();

  // All active and legacy keys purged
  assert.equal(store.get(KEYS.picoWords), undefined, "picoWords must be purged");
  assert.equal(store.get(KEYS.choice), undefined, "choice must be purged");
  assert.equal(store.get(KEYS.screen), undefined, "screen must be purged");
  assert.equal(store.get("cq_mode"), undefined, "Legacy cq_mode must be purged");
  assert.equal(store.get("cq_outcomes"), undefined, "Legacy cq_outcomes must be purged");
  assert.equal(store.get("cq_gap"), undefined, "Legacy cq_gap must be purged");
  assert.equal(store.get("cq_question"), undefined, "Legacy cq_question must be purged");
  assert.equal(store.get("cq_formulation"), undefined, "Legacy cq_formulation must be purged");
  assert.equal(store.get("cq_commentary"), undefined, "Legacy cq_commentary must be purged");
  assert.equal(store.get("cq_outcome"), undefined, "Legacy cq_outcome must be purged");
  assert.equal(store.get("cq_citation_style"), undefined, "Legacy cq_citation_style must be purged");
  assert.equal(store.get("aimed_citation_style"), undefined, "Real legacy aimed_citation_style must be purged");

  // ONLY aimed_specialty survives!
  assert.equal(store.size, 1, "Only aimed_specialty must survive in storage");
  assert.equal(store.get(KEYS.specialty), JSON.stringify("obgyn"), "aimed_specialty must be preserved");

  // Clean up mock
  delete (globalThis as unknown as { window?: unknown }).window;
});
