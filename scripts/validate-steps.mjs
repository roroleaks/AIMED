import assert from "node:assert/strict";
import { parseInput, validateKeywords } from "../src/lib/clinical-input.ts";
import { parseClinicalScenario } from "../src/lib/clinical-semantics.ts";
import { SPECIALTIES } from "../src/lib/specialties.ts";
import { generateDeterministicGapAnalysis } from "../src/lib/deterministic-gap.ts";
import { extractPicoFromQuestion } from "../src/lib/pico-parser.ts";
import { buildOutcomeContext, selectOutcomes } from "../src/lib/outcome-selection.ts";
import { classifyPaperType, CLINICAL_STUDY_TYPES } from "../src/lib/study-design.ts";
import {
  CITATION_STYLE_OPTIONS,
  formatReferenceInStyle,
  convertNarrativeToStyle
} from "../src/lib/citation-styles.ts";
import { generateDeterministicCommentary } from "../src/lib/deterministic-commentary.ts";
import { validateDeliverableIntegrity } from "../src/lib/deliverable-integrity.ts";
import { DEFAULT_LITERATURE_SOURCES, SEARCH_SOURCE_OPTIONS } from "../src/lib/literature-sources.ts";

console.log("================================================================================");
console.log("🚀 AIMed End-to-End Multi-Specialty Step-by-Step Validation");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// STEP 1 VALIDATION: Clinical Input, Specialty Selection & Search Sources
// -----------------------------------------------------------------------------
console.log("▶ Step 1: Validating Clinical Input, Specialties & Multi-Database Search Sources...");
assert.equal(Object.keys(SPECIALTIES).length >= 15, true, "Must have at least 15 medical specialties");
assert.equal(DEFAULT_LITERATURE_SOURCES.length, 5, "Must have 5 default literature sources");
assert.deepEqual(DEFAULT_LITERATURE_SOURCES, ["pubmed", "pmc", "semanticscholar", "openalex", "crossref"]);
assert.equal(SEARCH_SOURCE_OPTIONS.length, 5, "Search source options must list all 5 databases");

const testInput = "heart failure, sacubitril valsartan, enalapril, cardiovascular mortality";
const parsedKeywords = parseInput(testInput);
assert.equal(validateKeywords(parsedKeywords), null, "Valid 4-keyword input must have no error");

const scenario = parseClinicalScenario(testInput, "cardiology");
assert.equal(scenario.specialty, "cardiology", "Must identify cardiology specialty");
assert.ok(scenario.population.length > 0, "Must detect population");
assert.ok(scenario.intervention.length > 0, "Must detect intervention");
assert.ok(scenario.comparator.length > 0, "Must detect comparator");
console.log(`  ✓ Keywords parsed: "${testInput}"`);
console.log(`  ✓ Specialty detected: Cardiology (P: "${scenario.population}", I: "${scenario.intervention}", C: "${scenario.comparator}")`);
console.log(`  ✓ Sources configured: ${DEFAULT_LITERATURE_SOURCES.join(", ")}`);
console.log("  [Step 1 PASS]\n");

// -----------------------------------------------------------------------------
// STEP 2 VALIDATION: Evidence Map, 4 PICOs & 40 Clinical Study Types
// -----------------------------------------------------------------------------
console.log("▶ Step 2: Validating Evidence Mapping & 40 Clinical Study Types Classification...");
const gap = generateDeterministicGapAnalysis(testInput, "cardiology");
assert.equal(gap.known.length, 4, "Must generate exactly 4 established knowledge points");
assert.equal(gap.uncertain.length, 4, "Must generate exactly 4 conflicting evidence points");
assert.equal(gap.gaps.length, 4, "Must generate exactly 4 research gaps");
assert.equal(gap.suggestedQuestions.length, 4, "Must generate exactly 4 suggested PICO questions");

assert.equal(CLINICAL_STUDY_TYPES.length, 40, "All 40 clinical study types must be defined");
const sampleRct = classifyPaperType({ title: "A randomized controlled trial of sacubitril/valsartan", journal: "NEJM" });
assert.equal(sampleRct, "Randomized Controlled Trial (RCT)");
const sampleMeta = classifyPaperType({ title: "Systematic review and meta-analysis of heart failure therapies", journal: "Lancet" });
assert.equal(sampleMeta, "Systematic Review and Meta-Analysis");

console.log(`  ✓ Established knowledge points: ${gap.known.length}/4`);
console.log(`  ✓ Conflicting evidence points: ${gap.uncertain.length}/4`);
console.log(`  ✓ Research gaps: ${gap.gaps.length}/4`);
console.log(`  ✓ Suggested PICO questions: ${gap.suggestedQuestions.length}/4`);
console.log(`  ✓ Study designs classified: "${sampleRct}", "${sampleMeta}"`);
console.log("  [Step 2 PASS]\n");

// -----------------------------------------------------------------------------
// STEP 3 VALIDATION: PICO Extraction, Outcome Selection & 3 Citation Styles
// -----------------------------------------------------------------------------
console.log("▶ Step 3: Validating PICO Extraction, Outcome Selection & Citation Styles...");
const selectedQ = gap.suggestedQuestions[0].question;
const pico = extractPicoFromQuestion(selectedQ, testInput, "cardiology");
assert.ok(pico.condition.length > 0, "Condition must be extracted");
assert.ok(pico.intervention.length > 0, "Intervention must be extracted");
assert.ok(pico.comparator.length > 0, "Comparator must be extracted");

const outcomeContext = buildOutcomeContext(
  {
    specialty: "cardiology",
    condition: pico.condition,
    intervention: pico.intervention,
    comparator: pico.comparator,
    questionType: "Therapy / Prevention"
  },
  {},
  { originalInput: testInput, population: pico.condition }
);
const outcomeSelection = selectOutcomes(outcomeContext);
assert.ok(outcomeSelection.options.length >= 4 && outcomeSelection.options.length <= 6, "Must provide 4 to 6 outcome options");
assert.ok(outcomeSelection.recommendedOutcome.label.length > 0, "Must recommend primary outcome");

assert.equal(CITATION_STYLE_OPTIONS.length, 3, "Must support 3 citation styles: Vancouver, APA, Harvard");
console.log(`  ✓ Selected PICO: "${selectedQ.slice(0, 80)}..."`);
console.log(`  ✓ Recommended Outcome: "${outcomeSelection.recommendedOutcome.label}" (${outcomeSelection.options.length} options provided)`);
console.log(`  ✓ Citation Styles available: ${CITATION_STYLE_OPTIONS.map(c => c.name).join(" | ")}`);
console.log("  [Step 3 PASS]\n");

// -----------------------------------------------------------------------------
// STEP 4 VALIDATION: Commentary Synthesis, Unbracketed Vancouver, APA, Harvard & Deliverable Integrity
// -----------------------------------------------------------------------------
console.log("▶ Step 4: Validating Commentary Synthesis, Unbracketed Vancouver, APA, Harvard & Integrity Gates...");

const testRefs = [
  {
    pmid: "31234567",
    title: "Sacubitril/valsartan versus enalapril in heart failure patients",
    authors: "McMurray JJ, Packer M, Desai AS",
    year: "2021",
    journal: "N Engl J Med",
    doi: "10.1056/NEJMoa1409077",
    url: "https://pubmed.ncbi.nlm.nih.gov/31234567/",
    source: "pubmed"
  },
  {
    pmid: "32345678",
    title: "Cardiovascular outcomes with ARNI compared with ACE inhibitors: a meta-analysis",
    authors: "Smith R, Jones K, Brown T",
    year: "2022",
    journal: "Lancet",
    doi: "10.1016/S0140-6736(22)00123-4",
    url: "https://pubmed.ncbi.nlm.nih.gov/32345678/",
    source: "pubmed"
  }
];

const commentary = generateDeterministicCommentary({
  topic: testInput,
  selectedQuestion: selectedQ,
  outcomesText: outcomeSelection.recommendedOutcome.label,
  specialty: "cardiology",
  pool: testRefs
});

assert.ok(commentary.title.length > 0, "Commentary must have a title");
assert.ok(commentary.abstract.length > 0, "Commentary must have an abstract");
assert.ok(commentary.introduction.length > 0, "Commentary must have an introduction");
assert.ok(commentary.discussion.length > 0, "Commentary must have a discussion");
assert.ok(commentary.references.length > 0, "Commentary must have references");

// Test Vancouver unbracketed formatting:
const vancouverRefs = testRefs.map((r, i) => formatReferenceInStyle(r, "vancouver", i + 1));
assert.ok(!vancouverRefs[0].startsWith("[1]"), "Vancouver bib must not wrap number in brackets");
assert.ok(vancouverRefs[0].startsWith("1. "), "Vancouver bib must start with '1. Author...'");

const convertedVancouverProse = convertNarrativeToStyle("Clinical trials demonstrate efficacy [1, 2].", "vancouver", testRefs);
assert.equal(convertedVancouverProse, "Clinical trials demonstrate efficacy 1, 2.", "Vancouver in-text citations must not have brackets");

// Test APA formatting:
const apaRefs = testRefs.map((r, i) => formatReferenceInStyle(r, "apa", i + 1));
assert.ok(apaRefs[0].includes("(2021)"), "APA bib must include (Year)");
assert.ok(apaRefs[0].includes("https://doi.org/"), "APA bib must include https://doi.org/");

// Test Harvard formatting:
const harvardRefs = testRefs.map((r, i) => formatReferenceInStyle(r, "harvard", i + 1));
assert.ok(harvardRefs[0].includes("2021."), "Harvard bib must include Year.");

// Test deliverable integrity across all 3 styles:
const vancouverIntegrity = validateDeliverableIntegrity({
  fields: { abstract: "Clinical trials demonstrate efficacy [1, 2]." },
  references: vancouverRefs,
  retainedRecords: testRefs,
  exportReferences: vancouverRefs
});
assert.equal(vancouverIntegrity.ok, true, "Vancouver deliverable integrity must pass");

const apaIntegrity = validateDeliverableIntegrity({
  fields: { abstract: "Clinical trials demonstrate efficacy (McMurray et al., 2021; Smith et al., 2022)." },
  references: apaRefs,
  retainedRecords: testRefs,
  exportReferences: apaRefs
});
assert.equal(apaIntegrity.ok, true, "APA deliverable integrity must pass");

const harvardIntegrity = validateDeliverableIntegrity({
  fields: { abstract: "Clinical trials demonstrate efficacy (McMurray et al. 2021; Smith et al. 2022)." },
  references: harvardRefs,
  retainedRecords: testRefs,
  exportReferences: harvardRefs
});
assert.equal(harvardIntegrity.ok, true, "Harvard deliverable integrity must pass");

console.log(`  ✓ Commentary Title: "${commentary.title}"`);
console.log(`  ✓ Vancouver unbracketed in-text citation: "${convertedVancouverProse}"`);
console.log(`  ✓ Vancouver unbracketed bibliography: "${vancouverRefs[0].slice(0, 70)}..."`);
console.log(`  ✓ APA 7th bibliography: "${apaRefs[0].slice(0, 70)}..."`);
console.log(`  ✓ Harvard bibliography: "${harvardRefs[0].slice(0, 70)}..."`);
console.log(`  ✓ Deliverable integrity: Vancouver=OK, APA=OK, Harvard=OK`);
console.log("  [Step 4 PASS]\n");

console.log("================================================================================");
console.log("🎉 ALL 4 PIPELINE STEPS VALIDATED AND PASSING WITH 100% INTEGRITY");
console.log("================================================================================\n");
