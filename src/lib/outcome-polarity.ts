/**
 * Outcome polarity and clinical verb selection.
 * Harms/adverse events use "reduce" (e.g. preeclampsia, mortality, miscarriage, treatment failure).
 * Benefits/positive outcomes use "improve" (e.g. live birth, survival, quality of life).
 */

export type OutcomePolarity = "harm" | "benefit" | "neutral";

const HARM_OUTCOME_PATTERNS: RegExp[] = [
  /\b(?:mortality|death|fatalit\w*)\b/i,
  /\b(?:preeclampsia|pre-eclampsia|eclampsia)\b/i,
  /\b(?:miscarriage|pregnancy loss|stillbirth|spontaneous abortion)\b/i,
  /\b(?:treatment failure|therapeutic failure|treatment resistance)\b/i,
  /\b(?:adverse events?|complications?|morbidit\w*|toxicity|harm)\b/i,
  /\b(?:recurrence|relapse|rebleeding|bleeding|haemorrhag\w*|hemorrhag\w*)\b/i,
  /\b(?:hospitalization|admission|readmission|picu admission|icu admission)\b/i,
  /\b(?:fracture|decline|loss|impairment|infection|bacteremia|stroke)\b/i,
  /\b(?:pain|chronic pain|pelvic pain|pruritus|itch|nausea|vomiting)\b/i,
  /\b(?:coronary artery aneurysm|thromboembolic events?|end stage renal disease)\b/i
];

const BENEFIT_OUTCOME_PATTERNS: RegExp[] = [
  /\b(?:overall survival|progression-free survival|survival)\b/i,
  /\b(?:live birth|birth rate|pregnancy rate|implantation|oocyte yield)\b/i,
  /\b(?:quality of life|qol|patient satisfaction|functional recovery)\b/i,
  /\b(?:clinical cure|blood culture clearance|lactate clearance|mucosal healing|healing|resolution|clinical remission|remission)\b/i,
  /\b(?:skin clearance|durable skin clearance|pasi\s*90|pasi\s*100|easi\s*75|hiscr)\b/i,
  /\b(?:fev1|fvc|bone mineral density|bmd|madrs remission)\b/i,
  /\b(?:body weight reduction)\b/i
];

export function getOutcomePolarity(outcome: string): OutcomePolarity {
  const norm = String(outcome || "").trim();
  if (!norm) return "neutral";
  // Explicit relief/reduction/preservation/resolution are benefits
  if (/\b(?:reduction|relief|resolution|preservation|maintenance|clearance|cure)\b/i.test(norm)) {
    return "benefit";
  }
  // Weight loss in metabolic/obesity context is a desirable outcome
  if (/\b(?:weight loss|body weight loss)\b/i.test(norm)) {
    return "benefit";
  }
  if (HARM_OUTCOME_PATTERNS.some(re => re.test(norm))) return "harm";
  if (BENEFIT_OUTCOME_PATTERNS.some(re => re.test(norm))) return "benefit";
  return "neutral";
}

/**
 * Returns the appropriate clinical action verb for an outcome:
 * "reduce" for harms, events, and adverse endpoints.
 * "improve" for benefits, survival, function, and general outcomes.
 */
export function outcomeActionVerb(outcome: string): "reduce" | "improve" {
  return getOutcomePolarity(outcome) === "harm" ? "reduce" : "improve";
}
