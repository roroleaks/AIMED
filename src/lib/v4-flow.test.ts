import test from "node:test";
import assert from "node:assert/strict";
import { generateDeterministicScreen } from "./deterministic-screen.ts";
import { scoreRecords, filterExcludedRecords } from "./explore-scoring.ts";
import { composeManuscript } from "./manuscript-composer.ts";
import type { PicoWord } from "./pico-roles.ts";

test("V4 Flow: Step 1 (Words) -> Step 2 (Screen) -> Step 3 (Explore + Exclusion) -> Step 4 (Manuscript all 3 styles)", () => {
  // Step 1: Intake words (e.g. ObGyn preset)
  const words: PicoWord[] = [
    { word: "cervical insufficiency", role: "population" },
    { word: "cerclage", role: "intervention" },
    { word: "expectant management", role: "comparator" },
    { word: "preterm birth", role: "outcome" }
  ];
  assert.equal(words.length, 4, "Step 1: 4 PICO words defined");

  // Step 2: Deterministic Screening generates 3 distinct PICO phrases
  const screen = generateDeterministicScreen(words);
  assert.ok(screen.phrases.established.phrase.length > 0, "Step 2: Established phrase generated");
  assert.ok(screen.phrases.conflicting.phrase.length > 0, "Step 2: Conflicting phrase generated");
  assert.ok(screen.phrases.gap.phrase.length > 0, "Step 2: Gap phrase generated");
  assert.equal(new Set([
    screen.phrases.established.phrase,
    screen.phrases.conflicting.phrase,
    screen.phrases.gap.phrase
  ]).size, 3, "Step 2: All 3 phrases must be pairwise distinct");

  // Clinician chooses the conflicting focus
  const choice = {
    category: "conflicting" as const,
    phrase: screen.phrases.conflicting.phrase
  };

  // Step 3: Mock explored corpus scoring
  const mockCorpus = [
    {
      pmid: "3001",
      title: "Cervical cerclage compared with expectant management in cervical insufficiency for preterm birth",
      authors: "Berghella V, Odibo AO",
      journal: "Obstet Gynecol",
      year: "2021",
      doi: "10.1097/AOG.0000000000004123",
      context: "In cervical insufficiency, cerclage significantly reduced preterm birth compared with expectant management."
    },
    {
      pmid: "3002",
      title: "Expectant management outcomes in singleton pregnancy with shortened cervix",
      authors: "Smith R, Jones K",
      journal: "Am J Obstet Gynecol",
      year: "2020",
      doi: "10.1016/j.ajog.2020.05.011",
      context: "Expectant management demonstrated acceptable outcomes without invasive intervention."
    },
    {
      pmid: "3003",
      title: "Observational cohort of cervical cerclage in high risk obstetrics",
      authors: "Alfirevic Z, Stampalija T",
      journal: "Cochrane Database Syst Rev",
      year: "2019",
      doi: "10.1002/14651858.CD008991",
      context: "Cohort analysis showed equivocal benefit in unselected cohorts."
    },
    {
      pmid: "3004",
      title: "Emergency cerclage in advanced cervical dilation",
      authors: "Stupin JH, David M",
      journal: "J Matern Fetal Neonatal Med",
      year: "2018",
      doi: "10.1080/14767058.2017.1344965",
      context: "Emergency intervention prolonged gestation by an average of 4 weeks."
    }
  ];

  const scoredResult = scoreRecords(mockCorpus, choice.phrase, choice.category);
  assert.equal(scoredResult.scored.length, 4, "Step 3: All 4 records scored");

  // Clinician excludes 2 papers
  const userExcluded = ["p:3002", "p:3003"];
  const { surviving: retained } = filterExcludedRecords(scoredResult.scored, userExcluded, []);
  assert.equal(retained.length, 2, "Step 3: Exactly 2 records retained after excluding 2");
  const retainedPmids = retained.map(r => r.pmid);
  assert.ok(!retainedPmids.includes("3002"), "Excluded 3002 must not survive");
  assert.ok(!retainedPmids.includes("3003"), "Excluded 3003 must not survive");

  // Step 4: Compose Manuscript across all 3 citation styles
  const stats = {
    retrieved: 40,
    screened: 40,
    relaxationLevel: 0,
    excludedCount: 2
  };

  // 1. Vancouver style
  const vancouverDoc = composeManuscript({
    words,
    category: choice.category,
    phrase: choice.phrase,
    screeningStats: stats,
    records: retained,
    userExcluded,
    specialty: "obgyn",
    style: "vancouver"
  });
  assert.equal(vancouverDoc.sections.length, 5, "Step 4: Manuscript has 5 sections");
  assert.equal(vancouverDoc.references.length, 2, "Step 4: Exactly 2 references formatted");
  assert.ok(vancouverDoc.references[0].startsWith("1. "), "Vancouver references are numbered");
  assert.ok(!vancouverDoc.title.includes("(P)"), "Title must not embed raw role markers");
  assert.ok(!vancouverDoc.title.includes("(I)"), "Title must not embed raw role markers");

  // 2. APA style
  const apaDoc = composeManuscript({
    words,
    category: choice.category,
    phrase: choice.phrase,
    screeningStats: stats,
    records: retained,
    userExcluded,
    specialty: "obgyn",
    style: "apa"
  });
  assert.equal(apaDoc.references.length, 2, "APA references formatted");
  assert.ok(apaDoc.references[0].includes("(2021)"), "APA reference includes publication year in parentheses");

  // 3. Harvard style
  const harvardDoc = composeManuscript({
    words,
    category: choice.category,
    phrase: choice.phrase,
    screeningStats: stats,
    records: retained,
    userExcluded,
    specialty: "obgyn",
    style: "harvard"
  });
  assert.equal(harvardDoc.references.length, 2, "Harvard references formatted");
  assert.ok(harvardDoc.references[0].includes("2021."), "Harvard reference formats year correctly");

  // Citation integrity assertions: excluded papers never cited
  const fullText = JSON.stringify(vancouverDoc);
  assert.ok(!fullText.includes("3002"), "Excluded pmid 3002 must never appear in deliverable");
  assert.ok(!fullText.includes("3003"), "Excluded pmid 3003 must never appear in deliverable");
  assert.ok(!fullText.includes("Expectant management outcomes in singleton pregnancy"), "Excluded title must never appear");
  assert.ok(!fullText.includes("Observational cohort of cervical cerclage"), "Excluded title must never appear");

  // Zero hyperlinks assertion
  assert.equal((fullText.match(/https?:/g) || []).length, 0, "Deliverable must contain ZERO http/https occurrences");

  // Determinism check: repeating with identical inputs produces identical output
  const repeatDoc = composeManuscript({
    words,
    category: choice.category,
    phrase: choice.phrase,
    screeningStats: stats,
    records: retained,
    userExcluded,
    specialty: "obgyn",
    style: "vancouver"
  });
  assert.deepEqual(repeatDoc, vancouverDoc, "Composition must be 100% deterministic");
});
