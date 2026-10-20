/**
 * EBM Clinical Study Design & Paper Type Classification Engine
 *
 * Implements rigorous identification and labeling of medical publication study designs
 * adhering to evidence-based medicine (EBM) hierarchies and international reporting guidelines
 * (CONSORT, PRISMA, STROBE, STARD, TRIPOD, CARE).
 */

export const CLINICAL_STUDY_TYPES = [
  "Randomized Controlled Trial (RCT)",
  "Clinical Trial",
  "Cohort Study",
  "Prospective Cohort Study",
  "Retrospective Cohort Study",
  "Case-Control Study",
  "Cross-Sectional Study",
  "Case Series",
  "Case Report",
  "Observational Study",
  "Diagnostic Accuracy Study",
  "Prognostic Study",
  "Prediction Model Study",
  "Systematic Review",
  "Systematic Review and Meta-Analysis",
  "Meta-Analysis",
  "Scoping Review",
  "Narrative Review",
  "Umbrella Review",
  "Rapid Review",
  "Randomized Clinical Trial",
  "Non-Randomized Controlled Trial",
  "Quasi-Experimental Study",
  "Before-and-After Study",
  "Retrospective Study",
  "Prospective Study",
  "Comparative Study",
  "Pilot Study",
  "Feasibility Study",
  "Qualitative Study",
  "Mixed-Methods Study",
  "Survey Study",
  "Registry-Based Study",
  "Population-Based Study",
  "Ecological Study",
  "Diagnostic Test Study",
  "Validation Study",
  "Protocol",
  "In Vitro Study",
  "Animal Study"
] as const;

export type ClinicalStudyType = typeof CLINICAL_STUDY_TYPES[number] | "Clinical Study";

export interface PaperMetadataInput {
  title?: string;
  journal?: string;
  pubType?: string;
  publicationTypes?: string[];
  abstract?: string;
  context?: string;
}

export interface StudyDesignBadgeStyle {
  label: string;
  bg: string;
  color: string;
  border: string;
  category: "level-1" | "level-2" | "level-3" | "level-4" | "basic-protocol";
}

/**
 * Classifies a scientific paper into one of the canonical 40 clinical study types
 * based on PubMed publication types, title keywords, and contextual text.
 */
export function classifyPaperType(input: PaperMetadataInput | string): ClinicalStudyType {
  const meta: PaperMetadataInput = typeof input === "string" ? { title: input } : (input || {});
  const title = (meta.title || "").trim();
  const pubTypes = [
    ...(meta.publicationTypes || []),
    ...(meta.pubType ? [meta.pubType] : [])
  ].map(p => p.toLowerCase());
  const pubTypeStr = pubTypes.join(" ");
  const fullText = `${title} ${meta.journal || ""} ${meta.abstract || ""} ${meta.context || ""} ${pubTypeStr}`.toLowerCase();

  // 1. Systematic Review & Meta-Analysis combinations (Highest specificity)
  if (
    (fullText.includes("systematic review") && fullText.includes("meta-analysis")) ||
    (pubTypes.some(p => p.includes("systematic review")) && pubTypes.some(p => p.includes("meta-analysis"))) ||
    /systematic\s+(literature\s+)?review\s+(and|&)\s+meta-?analysis/i.test(fullText)
  ) {
    return "Systematic Review and Meta-Analysis";
  }

  // 2. Umbrella Review
  if (/\bumbrella\s+review\b|\breview\s+of\s+systematic\s+reviews\b/i.test(fullText)) {
    return "Umbrella Review";
  }

  // 3. Scoping Review
  if (/\bscoping\s+review\b/i.test(fullText)) {
    return "Scoping Review";
  }

  // 4. Rapid Review
  if (/\brapid\s+review\b/i.test(fullText)) {
    return "Rapid Review";
  }

  // 5. Meta-Analysis
  if (/\bmeta-?analysis\b|\bmeta-?analytic\b/i.test(fullText) || pubTypes.some(p => p === "meta-analysis")) {
    return "Meta-Analysis";
  }

  // 6. Systematic Review
  if (/\bsystematic\s+(literature\s+)?review\b/i.test(fullText) || pubTypes.some(p => p.includes("systematic review"))) {
    return "Systematic Review";
  }

  // 7. Non-Randomized Controlled Trial
  if (/\b(non-?randomi[zs]ed|unrandomi[zs]ed)\s+(controlled\s+)?(trial|study|evaluation)\b/i.test(fullText)) {
    return "Non-Randomized Controlled Trial";
  }

  // 8. Randomized Controlled Trial (RCT)
  if (
    /\brandomi[zs]ed\s+controlled\s+(clinical\s+)?trial\b|\b\(?rct\)?\b/i.test(fullText) ||
    pubTypes.some(p => p === "randomized controlled trial")
  ) {
    return "Randomized Controlled Trial (RCT)";
  }

  // 9. Randomized Clinical Trial
  if (/\brandomi[zs]ed\s+clinical\s+trial\b/i.test(fullText)) {
    return "Randomized Clinical Trial";
  }

  // 10. Quasi-Experimental Study
  if (/\bquasi-?experiment(al)?\b/i.test(fullText)) {
    return "Quasi-Experimental Study";
  }

  // 11. Before-and-After Study
  if (/\b(before-?and-?after|pre-?and-?post|pre-?post)\s+(study|trial|analysis|evaluation)\b/i.test(fullText)) {
    return "Before-and-After Study";
  }

  // 12. Prospective Cohort Study
  if (
    /\bprospective\s+(longitudinal\s+)?cohort\b|\bprospective\s+follow-?up\s+cohort\b/i.test(fullText) ||
    (/\bprospective\b/i.test(fullText) && /\bcohort\b/i.test(fullText))
  ) {
    return "Prospective Cohort Study";
  }

  // 13. Retrospective Cohort Study
  if (
    /\bretrospective\s+(longitudinal\s+)?cohort\b/i.test(fullText) ||
    (/\bretrospective\b/i.test(fullText) && /\bcohort\b/i.test(fullText))
  ) {
    return "Retrospective Cohort Study";
  }

  // 14. Population-Based Study
  if (/\bpopulation-?based\s+(study|cohort|analysis|survey)\b|\bnationwide\s+population\b/i.test(fullText)) {
    return "Population-Based Study";
  }

  // 15. Registry-Based Study
  if (/\b(registry-?based|disease\s+registry|national\s+registry|patient\s+registry)\b/i.test(fullText)) {
    return "Registry-Based Study";
  }

  // 16. Cohort Study
  if (/\bcohort\s+(study|analysis|investigation|evaluation)\b|\bcohort\b/i.test(fullText)) {
    return "Cohort Study";
  }

  // 17. Case-Control Study
  if (/\bcase-?control\b/i.test(fullText) || pubTypes.some(p => p.includes("case-control"))) {
    return "Case-Control Study";
  }

  // 18. Cross-Sectional Study
  if (/\bcross-?sectional\b/i.test(fullText) || pubTypes.some(p => p.includes("cross-sectional"))) {
    return "Cross-Sectional Study";
  }

  // 19. Ecological Study
  if (/\becologic(al)?\s+(study|analysis|investigation)\b/i.test(fullText)) {
    return "Ecological Study";
  }

  // 20. Diagnostic Accuracy Study
  if (
    /\bdiagnostic\s+accuracy\b|\baccuracy\s+of\s+diagnos(is|tic)\b|\breceiver\s+operating\s+characteristic\b|\broc\s+curve\b|\bsensitivity\s+and\s+specificity\b/i.test(fullText)
  ) {
    return "Diagnostic Accuracy Study";
  }

  // 21. Diagnostic Test Study
  if (/\bdiagnostic\s+(test|study|evaluation|assessment|modality)\b/i.test(fullText)) {
    return "Diagnostic Test Study";
  }

  // 22. Prediction Model Study
  if (/\bprediction\s+model\b|\bpredictive\s+model\b|\brisk\s+prediction\b|\bnomogram\b|\bclinical\s+prediction\s+rule\b/i.test(fullText)) {
    return "Prediction Model Study";
  }

  // 23. Prognostic Study
  if (/\bprognostic\s+(study|factor|model|score|marker|value)\b|\bprognos(is|tic)\b/i.test(fullText)) {
    return "Prognostic Study";
  }

  // 24. Validation Study
  if (/\bvalidation\s+study\b|\bexternal\s+validation\b|\binternal\s+validation\b|\bvalidation\b/i.test(fullText) || pubTypes.some(p => p === "validation study")) {
    return "Validation Study";
  }

  // 25. Protocol
  if (/\b(study|trial|clinical|research)\s+protocol\b|\bprotocol\s+for\s+a\b/i.test(fullText) || pubTypes.some(p => p.includes("protocol"))) {
    return "Protocol";
  }

  // 26. Pilot Study
  if (/\bpilot\s+(study|trial|investigation|evaluation)\b/i.test(fullText)) {
    return "Pilot Study";
  }

  // 27. Feasibility Study
  if (/\bfeasibility\s+(study|trial|investigation|evaluation)\b/i.test(fullText)) {
    return "Feasibility Study";
  }

  // 28. Mixed-Methods Study
  if (/\bmixed-?methods?\b/i.test(fullText)) {
    return "Mixed-Methods Study";
  }

  // 29. Qualitative Study
  if (/\bqualitative\s+(study|research|inquiry|thematic\s+analysis|interview)\b|\bfocus\s+group\b/i.test(fullText)) {
    return "Qualitative Study";
  }

  // 30. Survey Study
  if (/\b(survey\s+study|questionnaire\s+survey|cross-?sectional\s+survey|web-?based\s+survey|online\s+survey)\b/i.test(fullText)) {
    return "Survey Study";
  }

  // 31. Case Series
  if (/\bcase\s+series\b|\bconsecutive\s+cases\b|\bcase\s+series\s+of\b/i.test(fullText)) {
    return "Case Series";
  }

  // 32. Case Report
  if (/\bcase\s+report\b|\bcase\s+presentation\b|\bcase\s+description\b|\ba\s+case\s+of\b/i.test(fullText) || pubTypes.some(p => p.includes("case reports"))) {
    return "Case Report";
  }

  // 33. In Vitro Study
  if (/\bin\s+vitro\b|\bcell\s+culture\b|\bcell\s+line\b|\bmolecular\s+assay\b/i.test(fullText)) {
    return "In Vitro Study";
  }

  // 34. Animal Study
  if (/\banimal\s+study\b|\bin\s+vivo\b|\bmurine\s+model\b|\bmouse\s+model\b|\brat\s+model\b|\brodent\b|\bporcine\b|\bcanine\b|\bnon-human\s+primate\b/i.test(fullText)) {
    return "Animal Study";
  }

  // 35. Comparative Study
  if (/\bcomparative\s+(study|analysis|effectiveness|evaluation)\b|\bhead-?to-?head\b/i.test(fullText) || pubTypes.some(p => p === "comparative study")) {
    return "Comparative Study";
  }

  // 36. Prospective Study
  if (/\bprospective\s+(study|investigation|analysis|evaluation|audit)\b/i.test(fullText)) {
    return "Prospective Study";
  }

  // 37. Retrospective Study
  if (/\bretrospective\s+(study|chart\s+review|analysis|investigation|audit)\b/i.test(fullText)) {
    return "Retrospective Study";
  }

  // 38. Observational Study
  if (/\bobservational\s+(study|investigation|cohort|analysis)\b|\breal-?world\s+(evidence|data)\b/i.test(fullText) || pubTypes.some(p => p.includes("observational study"))) {
    return "Observational Study";
  }

  // 39. Clinical Trial
  if (/\bclinical\s+trial\b|\bphase\s+(I|II|III|IV|[1-4])\b/i.test(fullText) || pubTypes.some(p => p.includes("clinical trial"))) {
    return "Clinical Trial";
  }

  // 40. Narrative Review
  if (/\bnarrative\s+review\b|\breview\b/i.test(fullText) || pubTypes.some(p => p.includes("review"))) {
    return "Narrative Review";
  }

  // Fallback defaults
  if (/\btrial\b/i.test(fullText)) return "Clinical Trial";
  if (/\bcohort\b/i.test(fullText)) return "Cohort Study";
  return "Observational Study";
}

/**
 * Returns accessible, harmonious color styles for study design badges
 */
export function getStudyTypeBadgeStyle(type: ClinicalStudyType): StudyDesignBadgeStyle {
  switch (type) {
    case "Systematic Review and Meta-Analysis":
    case "Meta-Analysis":
    case "Systematic Review":
    case "Umbrella Review":
    case "Rapid Review":
    case "Scoping Review":
      return {
        label: type,
        bg: "#f0fdfa",
        color: "#0f766e",
        border: "#99f6e4",
        category: "level-1"
      };

    case "Randomized Controlled Trial (RCT)":
    case "Randomized Clinical Trial":
    case "Non-Randomized Controlled Trial":
    case "Clinical Trial":
      return {
        label: type,
        bg: "#eff6ff",
        color: "#1d4ed8",
        border: "#bfdbfe",
        category: "level-1"
      };

    case "Prospective Cohort Study":
    case "Retrospective Cohort Study":
    case "Cohort Study":
    case "Prospective Study":
    case "Retrospective Study":
    case "Population-Based Study":
    case "Registry-Based Study":
    case "Comparative Study":
    case "Quasi-Experimental Study":
    case "Before-and-After Study":
      return {
        label: type,
        bg: "#f0f9ff",
        color: "#0369a1",
        border: "#bae6fd",
        category: "level-2"
      };

    case "Case-Control Study":
    case "Cross-Sectional Study":
    case "Observational Study":
    case "Diagnostic Accuracy Study":
    case "Diagnostic Test Study":
    case "Prognostic Study":
    case "Prediction Model Study":
    case "Validation Study":
    case "Ecological Study":
      return {
        label: type,
        bg: "#faf5ff",
        color: "#6b21a8",
        border: "#e9d5ff",
        category: "level-3"
      };

    case "Case Series":
    case "Case Report":
    case "Survey Study":
    case "Qualitative Study":
    case "Mixed-Methods Study":
    case "Pilot Study":
    case "Feasibility Study":
    case "Narrative Review":
      return {
        label: type,
        bg: "#fffbeb",
        color: "#b45309",
        border: "#fde68a",
        category: "level-4"
      };

    case "Protocol":
    case "In Vitro Study":
    case "Animal Study":
    default:
      return {
        label: type,
        bg: "#f8fafc",
        color: "#475569",
        border: "#cbd5e1",
        category: "basic-protocol"
      };
  }
}
