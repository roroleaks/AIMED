function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage;
    }
  } catch {}
  return null;
}

export function sset(key: string, value: unknown) {
  try {
    getStorage()?.setItem(key, JSON.stringify(value));
  } catch {}
}

export function sget<T>(key: string): T | null {
  try {
    const raw = getStorage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const KEYS = {
  // Currently active clinical specialty key (e.g. "obgyn", "cardiology", "oncology", etc.)
  specialty: "aimed_specialty",
  // Stores the structured ClinicalInput payload (rawInput/keywords/normalizedKeywords).
  input: "cq_input",
  // Canonical comma-joined normalized keywords, the single string downstream stages read.
  inputText: "cq_input_text",
  mode: "cq_mode",
  gap: "cq_gap",
  question: "cq_question",
  formulation: "cq_formulation",
  commentary: "cq_commentary",
  outcomes: "cq_outcomes",
  // Selected citation style for deliverable & PDF: "vancouver" | "apa" | "harvard"
  citationStyle: "aimed_citation_style",

  // v4 session additions
  picoWords: "cq_pico_words",
  screen: "cq_screen",
  choice: "cq_choice",
  explore: "cq_explore",
  excluded: "cq_excluded",
  style: "cq_style"
} as const;

export interface ExcludedState {
  phrase: string;
  category: string;
  userExcluded: string[];
  seen: string[];
}

/**
 * Validates whether a cached literature-screening snapshot matches current PICO words,
 * matches current specialty, and has all 3 phrases.
 */
export function isMatchingScreenCache(
  cached: {
    specialty?: string;
    inputWords?: string[];
    phrases?: {
      established?: unknown;
      conflicting?: unknown;
      gap?: unknown;
    };
  } | null | undefined,
  currentWords: Array<{ word: string; role?: unknown } | string> | null | undefined,
  currentSpecialty?: string | null | undefined
): boolean {
  if (!cached || !currentWords || !Array.isArray(cached.inputWords) || !Array.isArray(currentWords)) return false;
  if (currentSpecialty !== undefined && cached.specialty !== currentSpecialty) return false;
  if (!cached.phrases?.established || !cached.phrases?.conflicting || !cached.phrases?.gap) return false;
  if (cached.inputWords.length !== currentWords.length) return false;

  for (let i = 0; i < currentWords.length; i++) {
    const rawCurr = currentWords[i];
    const currStr = (typeof rawCurr === "string" ? rawCurr : rawCurr?.word ?? "").trim().toLowerCase();
    const cachedStr = (cached.inputWords[i] ?? "").trim().toLowerCase();
    if (!currStr || currStr !== cachedStr) return false;
  }
  return true;
}

/**
 * Validates whether a cached explore snapshot matches the current choice selection.
 */
export function isMatchingExploreCache(
  cached: { phrase?: string; category?: string; records?: unknown[] } | null | undefined,
  choice: { phrase?: string; category?: string } | null | undefined,
  excludedState?: ExcludedState | null | undefined
): boolean {
  if (!cached || !choice) return false;
  if (!cached.phrase || !cached.category || !choice.phrase || !choice.category) return false;
  if (cached.phrase !== choice.phrase) return false;
  if (cached.category !== choice.category) return false;
  if (!Array.isArray(cached.records)) return false;
  if (excludedState && (excludedState.phrase !== choice.phrase || excludedState.category !== choice.category)) {
    return false;
  }
  return true;
}

export const LEGACY_PURGE_KEYS = [
  "cq_input",
  "cq_input_text",
  "cq_mode",
  "cq_gap",
  "cq_question",
  "cq_formulation",
  "cq_commentary",
  "cq_outcomes",
  "cq_outcome",
  "cq_citation_style"
] as const;

/**
 * Completely clears active session keys and storage when starting over,
 * explicitly purging legacy keys to avoid state leakage from older versions.
 * NEVER purges aimed_specialty.
 *
 * Note: legacy pages still write some of these keys until Prompt 04 — that is fine;
 * resetSession is only called by the new Step 4 "Start over" control added in a later prompt.
 */
export function resetSession() {
  try {
    const storage = getStorage();
    if (!storage) return;

    for (const [keyName, storageKey] of Object.entries(KEYS)) {
      if (keyName === "specialty" || storageKey === "aimed_specialty") {
        continue;
      }
      storage.removeItem(storageKey);
    }

    for (const leg of LEGACY_PURGE_KEYS) {
      storage.removeItem(leg);
    }
  } catch {}
}
