export function sset(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function sget<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
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
  // Selected literature search sources (e.g. ["pubmed", "openalex", "crossref"])
  sources: "aimed_search_sources",
  // Selected citation style for deliverable & PDF: "vancouver" | "apa" | "harvard"
  citationStyle: "aimed_citation_style"
};