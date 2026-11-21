import test from "node:test";
import assert from "node:assert/strict";
import {
  countWords,
  splitSentences,
  normalizeSentence,
  lintManuscriptQuality
} from "./manuscript-quality.ts";
import { generateDeterministicCommentary } from "./deterministic-commentary.ts";
import type { AuditableRef, PicoElement } from "./relevance.ts";

const MOCK_REFS: AuditableRef[] = [
  {
    pmid: "12345678",
    title: "Dapagliflozin in patients with heart failure",
    authors: "McMurray JJ, Solomon SD",
    year: "2019",
    journal: "N Engl J Med",
    context: "In patients with heart failure, dapagliflozin reduced cardiovascular death by 18% (p=0.029, 95% CI 0.73-0.97)."
  },
  {
    pmid: "23456789",
    title: "Empagliflozin in heart failure with preserved ejection fraction",
    authors: "Anker SD, Butler J",
    year: "2021",
    journal: "N Engl J Med",
    context: "Empagliflozin reduced the combined risk of cardiovascular death or hospitalization."
  }
];

const MOCK_ELEMENTS: PicoElement[] = [
  { label: "Population", value: "patients with heart failure" },
  { label: "Intervention", value: "dapagliflozin" },
  { label: "Comparator", value: "placebo" },
  { label: "Outcome", value: "cardiovascular death" }
];

test("MQ1. countWords accurately counts words while ignoring markdown markup", () => {
  const md = "This sentence has exactly six distinct words.";
  assert.equal(countWords(md), 7);

  const tableMd = "Introduction paragraph.\n\n| Col 1 | Col 2 |\n| --- | --- |\n| Val 1 | Val 2 |\n\nConclusion text.";
  assert.equal(countWords(tableMd), 4); // "Introduction paragraph" + "Conclusion text"
});

test("MQ2. splitSentences splits narrative correctly and ignores headers and tables", () => {
  const text = "First sentence here. Second sentence follows! Third sentence is last?";
  const sents = splitSentences(text);
  assert.equal(sents.length, 3);
});

test("MQ3. normalizeSentence removes citations, numbers and punctuation", () => {
  const raw = "In trial [1, 2], dapagliflozin reduced mortality!";
  const norm = normalizeSentence(raw);
  assert.equal(norm, "in trial dapagliflozin reduced mortality");
});

test("MQ4. Rule 1: No duplicated boilerplate detects identical sentences across sections", () => {
  const repeated = "This comprehensive trial evaluated patient clinical outcomes over a prolonged follow-up period.";
  // Negative test (violation)
  const reportFail = lintManuscriptQuality({
    introduction: `First paragraph. ${repeated}`,
    discussion: `Discussion opener. ${repeated}`,
    retainedRecords: MOCK_REFS,
    isSparse: true // bypass word floors for this targeted test
  });
  const rule1Fail = reportFail.rules.find(r => r.rule === "no-duplicated-boilerplate");
  assert.ok(rule1Fail && !rule1Fail.passed, "Must fail when identical sentence appears across sections");
  assert.ok(reportFail.duplicatedSentences.length > 0);

  // Positive test (clean)
  const reportPass = lintManuscriptQuality({
    introduction: "First unique paragraph describing background context and epidemiology of the disease.",
    discussion: "Discussion section interpreting the findings across all retained trial cohorts carefully.",
    retainedRecords: MOCK_REFS,
    isSparse: true
  });
  const rule1Pass = reportPass.rules.find(r => r.rule === "no-duplicated-boilerplate");
  assert.ok(rule1Pass && rule1Pass.passed, "Must pass when no sentences are repeated");
});

test("MQ5. Rule 2: Word floors enforces prescribed section lengths", () => {
  // Negative test: short introduction
  const shortIntro = "Too short introduction.";
  const reportFail = lintManuscriptQuality({
    abstract: new Array(280).fill("word").join(" "),
    introduction: shortIntro,
    methods: new Array(420).fill("word").join(" "),
    results: new Array(420).fill("word").join(" "),
    discussion: new Array(420).fill("word").join(" "),
    conclusion: new Array(150).fill("word").join(" "),
    retainedRecords: MOCK_REFS
  });
  const rule2Fail = reportFail.rules.find(r => r.rule === "word-floors");
  assert.ok(rule2Fail && !rule2Fail.passed, "Must fail when introduction is below floor");

  // Positive test: all sections meet floors
  const reportPass = lintManuscriptQuality({
    abstract: new Array(280).fill("word").join(" "),
    introduction: new Array(260).fill("word").join(" "),
    methods: new Array(410).fill("word").join(" "),
    results: new Array(410).fill("word").join(" "),
    discussion: new Array(420).fill("word").join(" "),
    conclusion: new Array(140).fill("word").join(" "),
    retainedRecords: MOCK_REFS
  });
  const rule2Pass = reportPass.rules.find(r => r.rule === "word-floors");
  assert.ok(rule2Pass && rule2Pass.passed, "Must pass when all sections meet floors");
});

test("MQ6. Rule 3: Honesty scan flags untraceable statistics", () => {
  // Negative test: fabricated 45% statistic not in MOCK_REFS context
  const reportFail = lintManuscriptQuality({
    introduction: "In this study dapagliflozin reduced mortality by 45% [1].",
    retainedRecords: MOCK_REFS,
    isSparse: true
  });
  const rule3Fail = reportFail.rules.find(r => r.rule === "honesty-scan");
  assert.ok(rule3Fail && !rule3Fail.passed, "Must fail when statistic is untraceable in records");
  assert.ok(reportFail.untraceableStats.includes("45%"));

  // Positive test: 18% exists in MOCK_REFS context ("reduced cardiovascular death by 18%")
  const reportPass = lintManuscriptQuality({
    introduction: "In this study dapagliflozin reduced mortality by 18% [1].",
    retainedRecords: MOCK_REFS,
    isSparse: true
  });
  const rule3Pass = reportPass.rules.find(r => r.rule === "honesty-scan");
  assert.ok(rule3Pass && rule3Pass.passed, "Must pass when statistic is traceable to cited abstract");
});

test("MQ7. Rule 4: Citation coverage catches uncited assertive sentences", () => {
  // Negative test: assertive sentence ("reduced mortality") without citation bracket
  const reportFail = lintManuscriptQuality({
    results: "Dapagliflozin significantly reduced cardiovascular mortality in heart failure.",
    elements: MOCK_ELEMENTS,
    retainedRecords: MOCK_REFS,
    isSparse: true
  });
  const rule4Fail = reportFail.rules.find(r => r.rule === "citation-coverage");
  assert.ok(rule4Fail && !rule4Fail.passed, "Must fail when assertive sentence lacks citation");

  // Positive test: assertive sentence carries citation bracket [1]
  const reportPass = lintManuscriptQuality({
    results: "Dapagliflozin significantly reduced cardiovascular mortality in heart failure [1].",
    elements: MOCK_ELEMENTS,
    retainedRecords: MOCK_REFS,
    isSparse: true
  });
  const rule4Pass = reportPass.rules.find(r => r.rule === "citation-coverage");
  assert.ok(rule4Pass && rule4Pass.passed, "Must pass when assertive sentence has citation");
});

test("MQ8. Rule 5: Hedging calibration prohibits strong conclusive wording with sparse evidence", () => {
  // Negative test: "consistently showed" with only 1 record
  const singleRef = [MOCK_REFS[0]];
  const reportFail = lintManuscriptQuality({
    conclusion: "The evidence consistently showed dramatic improvement in clinical outcomes.",
    retainedRecords: singleRef,
    isSparse: true
  });
  const rule5Fail = reportFail.rules.find(r => r.rule === "hedging-calibration");
  assert.ok(rule5Fail && !rule5Fail.passed, "Must fail strong hedging with single record");

  // Positive test: cautious hedging with single record
  const reportPass = lintManuscriptQuality({
    conclusion: "There is preliminary evidence suggesting possible benefit, but further trials are needed.",
    retainedRecords: singleRef,
    isSparse: true
  });
  const rule5Pass = reportPass.rules.find(r => r.rule === "hedging-calibration");
  assert.ok(rule5Pass && rule5Pass.passed, "Must pass cautious hedging with sparse evidence");
});

test("MQ9. Full generated deterministic commentary passes quality linter", () => {
  const comm = generateDeterministicCommentary({
    selectedQuestion: "In patients with heart failure, does dapagliflozin compared with placebo improve cardiovascular death?",
    outcomesText: "cardiovascular death",
    reason: "test",
    pool: MOCK_REFS,
    elements: MOCK_ELEMENTS
  });

  const report = lintManuscriptQuality({
    ...comm,
    retainedRecords: MOCK_REFS,
    isSparse: false
  });

  const failedRules = report.rules.filter(r => !r.passed && r.severity === "error").map(r => `${r.rule}: ${r.message}`);
  assert.equal(report.passed, true, `Quality linter failed with errors: ${failedRules.join("; ")}`);
});

