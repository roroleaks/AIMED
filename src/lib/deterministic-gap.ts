import { type SpecialtyKey } from "./kb.ts";
import { parseClinicalScenario, formulatePopulationPhrase } from "./clinical-semantics.ts";
import { getSpecialtyDefinition } from "./specialties.ts";

export interface DeterministicGapPoint {
  point: string;
  searchQuery?: string;
  references?: Array<Record<string, unknown>>;
}

export interface DeterministicGapPayload {
  topic: string;
  specialty: SpecialtyKey | null;
  known: DeterministicGapPoint[];
  uncertain: DeterministicGapPoint[];
  gaps: Array<{ gap: string; why: string }>;
  suggestedQuestions: Array<{ question: string; rationale: string }>;
}

/**
 * Deterministic evidence mapping engine for universal evidence-based clinical medicine.
 * Generates calibrated 4-known, 4-uncertain, 4-gaps, and 4-PICO questions
 * without requiring an external AI provider or when the AI service is unreachable/rate-limited.
 */
export function generateDeterministicGapAnalysis(rawTopic: string, explicitSpecialty?: SpecialtyKey | null): DeterministicGapPayload {
  const topic = (rawTopic || "").trim() || "evidence-based clinical management and patient outcomes";
  const scenario = parseClinicalScenario(topic, explicitSpecialty);
  const specialty: SpecialtyKey = scenario.specialty;

  const condition = scenario.population;
  const intervention = scenario.intervention;
  const comparator = scenario.comparator;
  const [o1 = "the primary clinical outcome", o2 = o1, o3 = o2] = scenario.outcomes;
  const def = getSpecialtyDefinition(specialty);
  const guidelines = def?.authorityGuidelines || "major specialty societies";
  const field = (def?.label || "clinical").toLowerCase();
  const people = formulatePopulationPhrase(condition, specialty);
  // Search terms are the clinician's own PICO words, so every point retrieves papers about the
  // topic that was typed rather than about generic screening or monitoring.
  // The point-specific words go first: search queries are truncated, and a long population name
  // must not push out the words that make each point's search different from the others.
  const q = (...parts: string[]) => parts.join(" ").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const core = (...extra: string[]) => q(...extra, intervention, condition);
  const comparatorIsActive = !/placebo|standard care|usual care|no treatment|expectant/i.test(comparator);

  // Build 4 established knowledge points. Every point is about the typed P, I, C or O, and
  // is worded at the strength an evidence map can support (trials exist, guidelines address it).
  const known: DeterministicGapPoint[] = [
    {
      point: `Randomized controlled trials have evaluated ${intervention} against ${comparator} in ${people}, with ${o1} as a principal endpoint.`,
      searchQuery: core("randomized trial", comparatorIsActive ? comparator : "")
    },
    {
      point: `Systematic reviews and meta-analyses have pooled the trial evidence on ${intervention} for ${condition}, including its effect on ${o2}.`,
      searchQuery: core("meta-analysis")
    },
    {
      point: `Clinical practice guidelines (${guidelines}) address the place of ${intervention} in the management of ${condition}.`,
      searchQuery: core("guideline")
    },
    {
      point: `The safety profile of ${intervention} in ${condition}, including adverse events and treatment discontinuation, has been reported in controlled studies.`,
      searchQuery: core("safety adverse")
    }
  ];

  // Build 4 conflicting / uncertain evidence points
  const uncertain: DeterministicGapPoint[] = [
    {
      point: `The size of the effect of ${intervention} compared with ${comparator} on ${o1} varies between studies, reflecting differences in patient selection, dosing and follow-up.`,
      searchQuery: core(o1.split(/\s+/).slice(0, 3).join(" "), comparatorIsActive ? comparator : "")
    },
    {
      point: `Whether the benefit of ${intervention} on ${o2} is consistent across subgroups defined by age, disease severity and comorbidity is not settled.`,
      searchQuery: core("subgroup")
    },
    {
      point: `Evidence on the durability of the effect of ${intervention} on ${o3} beyond the follow-up of the pivotal trials is limited and partly observational.`,
      searchQuery: core("long-term follow-up")
    },
    {
      point: `Real-world effectiveness and adherence to ${intervention} in routine ${field} practice may differ from efficacy observed in trial populations.`,
      searchQuery: core("real-world")
    }
  ];

  // Build 4 evidence gaps
  const gaps: Array<{ gap: string; why: string }> = [
    {
      gap: comparatorIsActive
        ? `Adequately powered head-to-head randomized trials of ${intervention} versus ${comparator} on ${o1} in ${people} are scarce.`
        : `Randomized evidence comparing ${intervention} with active alternative treatments, rather than ${comparator}, on ${o1} in ${people} is limited.`,
      why: `Direct comparisons are needed to rank treatment options for ${condition} instead of inferring them across separate trials.`
    },
    {
      gap: `Clinical or biomarker predictors of who benefits most from ${intervention} in ${condition} have not been validated prospectively.`,
      why: "Validated predictors would allow treatment to be targeted to patients most likely to benefit and spare others avoidable harm."
    },
    {
      gap: `Patient-reported outcomes and quality of life are reported less consistently than ${o1} in trials of ${intervention}.`,
      why: "Decisions shared with patients require evidence on how treatment changes symptoms, function and daily life, not only on clinical endpoints."
    },
    {
      gap: `Older, multimorbid and under-represented populations with ${condition} are sparsely included in trials of ${intervention}.`,
      why: "Trial results may not transfer to the patients most often treated in routine care, so effectiveness and safety in these groups remain uncertain."
    }
  ];

  // Build 4 suggested PICO-format clinical questions
  const popTarget = (specialty === "obstetrics" || specialty === "infertility" || specialty === "gynecology")
    ? `women with ${condition}`
    : `patients with ${condition}`;

  const suggestedQuestions: Array<{ question: string; rationale: string }> = [
    {
      question: `In ${popTarget} (P), does ${intervention} (I) compared with ${comparator} (C) improve primary patient-centered clinical outcomes (O)?`,
      rationale: "Evaluates the fundamental efficacy of the primary intervention against standard control."
    },
    {
      question: `In high-risk subgroups of ${popTarget} (P), does early intervention with ${intervention} (I) compared with conservative management (C) reduce disease progression or acute complications (O)?`,
      rationale: "Addresses risk-stratified timing and threshold for proactive clinical intervention."
    },
    {
      question: `In ${popTarget} (P), does ${intervention} combined with adjuvant therapy (I) compared with ${intervention} monotherapy (C) improve cumulative therapeutic success (O)?`,
      rationale: "Tests potential synergistic or additive benefit of combination regimens."
    },
    {
      question: `In patients undergoing ${intervention} for ${condition} (P), does structured protocolized follow-up (I) compared with routine clinical monitoring (C) decrease long-term morbidity and treatment-related complications (O)?`,
      rationale: "Focuses on surveillance safety, adverse event mitigation, and quality assurance."
    }
  ];

  return {
    topic,
    specialty,
    known,
    uncertain,
    gaps,
    suggestedQuestions: scenario.suggestedQuestions?.length ? scenario.suggestedQuestions : suggestedQuestions
  };
}
