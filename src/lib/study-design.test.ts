import test from "node:test";
import assert from "node:assert/strict";
import {
  CLINICAL_STUDY_TYPES,
  classifyPaperType,
  getStudyTypeBadgeStyle
} from "./study-design.ts";

test("SD1. CLINICAL_STUDY_TYPES contains all 40 required clinical study designs", () => {
  assert.equal(CLINICAL_STUDY_TYPES.length, 40);
  assert.ok(CLINICAL_STUDY_TYPES.includes("Randomized Controlled Trial (RCT)"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Clinical Trial"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Cohort Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Prospective Cohort Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Retrospective Cohort Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Case-Control Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Cross-Sectional Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Case Series"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Case Report"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Observational Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Diagnostic Accuracy Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Prognostic Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Prediction Model Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Systematic Review"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Systematic Review and Meta-Analysis"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Meta-Analysis"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Scoping Review"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Narrative Review"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Umbrella Review"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Rapid Review"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Randomized Clinical Trial"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Non-Randomized Controlled Trial"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Quasi-Experimental Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Before-and-After Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Retrospective Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Prospective Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Comparative Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Pilot Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Feasibility Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Qualitative Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Mixed-Methods Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Survey Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Registry-Based Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Population-Based Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Ecological Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Diagnostic Test Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Validation Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Protocol"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("In Vitro Study"));
  assert.ok(CLINICAL_STUDY_TYPES.includes("Animal Study"));
});

test("SD2. classifyPaperType correctly identifies RCTs and clinical trials", () => {
  assert.equal(
    classifyPaperType("Vaginal progesterone vs cerclage for short cervix: a randomized controlled trial"),
    "Randomized Controlled Trial (RCT)"
  );
  assert.equal(
    classifyPaperType({ title: "Evaluation of cerclage efficacy", publicationTypes: ["Randomized Controlled Trial"] }),
    "Randomized Controlled Trial (RCT)"
  );
  assert.equal(
    classifyPaperType("Progesterone therapy in twin pregnancy: a randomized clinical trial"),
    "Randomized Clinical Trial"
  );
  assert.equal(
    classifyPaperType("Safety of pessary vs progesterone: a non-randomized controlled trial"),
    "Non-Randomized Controlled Trial"
  );
  assert.equal(
    classifyPaperType("Phase II clinical trial of vaginal progesterone"),
    "Clinical Trial"
  );
});

test("SD3. classifyPaperType correctly identifies Systematic Reviews and Meta-Analyses", () => {
  assert.equal(
    classifyPaperType("Progesterone for preterm prevention: a systematic review and meta-analysis"),
    "Systematic Review and Meta-Analysis"
  );
  assert.equal(
    classifyPaperType("Vaginal progesterone: an individual patient data meta-analysis"),
    "Meta-Analysis"
  );
  assert.equal(
    classifyPaperType("Cervical length screening protocols: a systematic review of current evidence"),
    "Systematic Review"
  );
  assert.equal(
    classifyPaperType("Interventions for preterm birth: an umbrella review of systematic reviews"),
    "Umbrella Review"
  );
  assert.equal(
    classifyPaperType("Digital health interventions in obstetrics: a scoping review"),
    "Scoping Review"
  );
  assert.equal(
    classifyPaperType("Emergency cerclage in advanced dilation: a rapid review"),
    "Rapid Review"
  );
  assert.equal(
    classifyPaperType("Current concepts in cervical insufficiency: a narrative review"),
    "Narrative Review"
  );
});

test("SD4. classifyPaperType correctly identifies Cohort and Observational designs", () => {
  assert.equal(
    classifyPaperType("Outcomes after Arabin pessary placement: a prospective cohort study"),
    "Prospective Cohort Study"
  );
  assert.equal(
    classifyPaperType("Perinatal outcomes following emergency cerclage: a retrospective cohort study"),
    "Retrospective Cohort Study"
  );
  assert.equal(
    classifyPaperType("Neonatal morbidity in singleton preterm births: a population-based study"),
    "Population-Based Study"
  );
  assert.equal(
    classifyPaperType("Maternal outcomes in Nordic nations: a nationwide registry-based study"),
    "Registry-Based Study"
  );
  assert.equal(
    classifyPaperType("Risk factors for recurrent preterm delivery: a matched case-control study"),
    "Case-Control Study"
  );
  assert.equal(
    classifyPaperType("Prevalence of asymptomatic short cervix: a cross-sectional study"),
    "Cross-Sectional Study"
  );
  assert.equal(
    classifyPaperType("Real-world evidence on vaginal progesterone: an observational study"),
    "Observational Study"
  );
  assert.equal(
    classifyPaperType("Statewide air quality and birth weight: an ecological study"),
    "Ecological Study"
  );
});

test("SD5. classifyPaperType correctly identifies Diagnostic, Prognostic, and Validation studies", () => {
  assert.equal(
    classifyPaperType("Transvaginal ultrasound for preterm prediction: a diagnostic accuracy study"),
    "Diagnostic Accuracy Study"
  );
  assert.equal(
    classifyPaperType("Fetal fibronectin diagnostic test evaluation in symptomatic women"),
    "Diagnostic Test Study"
  );
  assert.equal(
    classifyPaperType("Nomogram for spontaneous preterm delivery: a prediction model study"),
    "Prediction Model Study"
  );
  assert.equal(
    classifyPaperType("Prognostic value of cervical length and elastography: a prognostic study"),
    "Prognostic Study"
  );
  assert.equal(
    classifyPaperType("External validation of the PRE-TERM risk calculator: a validation study"),
    "Validation Study"
  );
});

test("SD6. classifyPaperType correctly identifies Experimental, Pilot, and Qualitative designs", () => {
  assert.equal(
    classifyPaperType("Impact of hospital protocol implementation: a before-and-after study"),
    "Before-and-After Study"
  );
  assert.equal(
    classifyPaperType("Evaluation of multidisciplinary clinic introduction: a quasi-experimental study"),
    "Quasi-Experimental Study"
  );
  assert.equal(
    classifyPaperType("Head-to-head comparison of two progesterone formulations: a comparative study"),
    "Comparative Study"
  );
  assert.equal(
    classifyPaperType("Progesterone pessary in high-risk women: a pilot study"),
    "Pilot Study"
  );
  assert.equal(
    classifyPaperType("Acceptability of home cervical monitoring: a feasibility study"),
    "Feasibility Study"
  );
  assert.equal(
    classifyPaperType("Maternal perspectives on bed rest vs progesterone: a qualitative study"),
    "Qualitative Study"
  );
  assert.equal(
    classifyPaperType("Clinician adherence to preterm guidelines: a mixed-methods study"),
    "Mixed-Methods Study"
  );
  assert.equal(
    classifyPaperType("National practice patterns in cervical insufficiency: a survey study"),
    "Survey Study"
  );
  assert.equal(
    classifyPaperType("Management of extreme cervical shortening: a case series of 45 patients"),
    "Case Series"
  );
  assert.equal(
    classifyPaperType("Successful rescue cerclage at 25 weeks with bulging membranes: a case report"),
    "Case Report"
  );
});

test("SD7. classifyPaperType correctly identifies Protocol, In Vitro, and Animal studies", () => {
  assert.equal(
    classifyPaperType("Vaginal progesterone vs cerclage trial: a study protocol"),
    "Protocol"
  );
  assert.equal(
    classifyPaperType("Progesterone anti-inflammatory signaling in human myometrial cells: an in vitro study"),
    "In Vitro Study"
  );
  assert.equal(
    classifyPaperType("Cervical remodeling and collagen cross-linking in a murine model: an animal study"),
    "Animal Study"
  );
});

test("SD8. getStudyTypeBadgeStyle provides distinct accessible badges with level categories", () => {
  const rctStyle = getStudyTypeBadgeStyle("Randomized Controlled Trial (RCT)");
  assert.equal(rctStyle.category, "level-1");
  assert.ok(rctStyle.color);
  assert.ok(rctStyle.bg);
  assert.ok(rctStyle.border);

  const cohortStyle = getStudyTypeBadgeStyle("Prospective Cohort Study");
  assert.equal(cohortStyle.category, "level-2");

  const caseControlStyle = getStudyTypeBadgeStyle("Case-Control Study");
  assert.equal(caseControlStyle.category, "level-3");

  const reportStyle = getStudyTypeBadgeStyle("Case Report");
  assert.equal(reportStyle.category, "level-4");

  const protocolStyle = getStudyTypeBadgeStyle("Protocol");
  assert.equal(protocolStyle.category, "basic-protocol");
});
