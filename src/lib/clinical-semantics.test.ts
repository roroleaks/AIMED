import test from "node:test";
import assert from "node:assert/strict";
import { parseClinicalScenario, getOutcomeDirection } from "./clinical-semantics.ts";
import { extractPicoFromQuestion } from "./pico-parser.ts";

test("parseClinicalScenario deeply classifies endometriosis example without mixing P, I, C", () => {
  const input = "endometriosis, laparoscopy, dienogest, pelvic pain, ovarian reserve";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "gynecology");
  assert.equal(scenario.population, "endometriosis", "Population must strictly be endometriosis, not the whole phrase");
  assert.equal(scenario.intervention, "laparoscopic surgery");
  assert.equal(scenario.comparator, "dienogest");
  assert.ok(scenario.outcomes.some(o => o.includes("pelvic pain") || o.includes("ovarian reserve")));

  for (const q of scenario.suggestedQuestions) {
    // Verify Population (P) doesn't contain laparoscopy or dienogest
    assert.ok(!q.question.includes("laparoscopy (P)"), "P must not contain intervention");
    assert.ok(!q.question.includes("dienogest (P)"), "P must not contain comparator");
    // Verify each question cleanly separates (P), (I), (C), (O)
    assert.ok(q.question.includes("(P)") && q.question.includes("(I)") && q.question.includes("(C)") && q.question.includes("(O)"));
    // Verify no illogical phrases
    assert.ok(!q.question.includes("reduce preservation"), "Must not reduce preservation");
  }

  // Verify roundtrip through extractPicoFromQuestion
  const extracted = extractPicoFromQuestion(scenario.suggestedQuestions[0].question, input);
  assert.equal(extracted.condition, "endometriosis");
  assert.equal(extracted.intervention, "laparoscopic surgery");
  assert.equal(extracted.comparator, "dienogest");
});

test("parseClinicalScenario deeply classifies short cervix / preterm birth example", () => {
  const input = "short cervix, vaginal progesterone, cerclage, preterm birth, cervical length";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "obstetrics");
  assert.equal(scenario.population, "short cervix", "Population must be short cervix");
  assert.equal(scenario.intervention, "vaginal progesterone");
  assert.equal(scenario.comparator, "cervical cerclage");
  assert.ok(scenario.outcomes.some(o => o.includes("preterm birth") || o.includes("cervical length")));

  for (const q of scenario.suggestedQuestions) {
    assert.ok(q.question.includes("short cervix (P)"));
    assert.ok(q.question.includes("vaginal progesterone (I)"));
    assert.ok(q.question.includes("cervical cerclage (C)"));
    // Verify no clinical blunders
    assert.ok(!q.question.includes("reduce cervical length"), "Must not reduce cervical length");
    assert.ok(!q.question.includes("preserve perinatal mortality"), "Must not preserve mortality");
    assert.ok(!q.question.includes("improve preterm birth"), "Must not improve preterm birth");
  }

  const extracted = extractPicoFromQuestion(scenario.suggestedQuestions[0].question, input);
  assert.equal(extracted.condition, "short cervix");
  assert.equal(extracted.intervention, "vaginal progesterone");
  assert.equal(extracted.comparator, "cervical cerclage");
});

test("parseClinicalScenario deeply classifies PCOS / fertility example", () => {
  const input = "PCOS, letrozole, clomiphene, live birth rate, ovulation";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "infertility");
  assert.equal(scenario.population, "polycystic ovary syndrome");
  assert.equal(scenario.intervention, "letrozole");
  assert.equal(scenario.comparator, "clomiphene citrate");
  assert.ok(scenario.outcomes.some(o => o.includes("live birth") || o.includes("ovulation")));

  for (const q of scenario.suggestedQuestions) {
    assert.ok(q.question.includes("polycystic ovary syndrome (P)"));
    assert.ok(q.question.includes("letrozole (I)"));
    assert.ok(q.question.includes("clomiphene citrate (C)"));
    assert.ok(!q.question.includes("reduce live birth"), "Must not reduce live birth");
  }

  const extracted = extractPicoFromQuestion(scenario.suggestedQuestions[0].question, input);
  assert.equal(extracted.condition, "polycystic ovary syndrome");
  assert.equal(extracted.intervention, "letrozole");
  assert.equal(extracted.comparator, "clomiphene citrate");
});

test("parseClinicalScenario handles preeclampsia example with single intervention", () => {
  const input = "preeclampsia, low-dose aspirin, preterm delivery, fetal growth restriction";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "obstetrics");
  assert.equal(scenario.population, "preeclampsia");
  assert.equal(scenario.intervention, "low-dose aspirin");
  assert.ok(scenario.comparator.includes("standard care") || scenario.comparator.includes("expectant"));

  for (const q of scenario.suggestedQuestions) {
    assert.ok(q.question.includes("preeclampsia (P)"));
    assert.ok(q.question.includes("low-dose aspirin (I)"));
  }
});

test("parseClinicalScenario deeply classifies uterine fibroids scenario", () => {
  const input = "uterine fibroids, myomectomy, uterine artery embolization, heavy menstrual bleeding";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "gynecology");
  assert.equal(scenario.population, "uterine fibroids");
  assert.equal(scenario.intervention, "myomectomy");
  assert.equal(scenario.comparator, "uterine artery embolization");

  for (const q of scenario.suggestedQuestions) {
    assert.ok(q.question.includes("uterine fibroids (P)"));
    assert.ok(q.question.includes("myomectomy (I)"));
    assert.ok(q.question.includes("uterine artery embolization (C)"));
  }
});

test("parseClinicalScenario deeply classifies recurrent pregnancy loss scenario", () => {
  const input = "recurrent pregnancy loss, low-dose aspirin, low molecular weight heparin, live birth rate";
  const scenario = parseClinicalScenario(input);

  assert.ok(scenario.specialty === "obstetrics" || scenario.specialty === "infertility");
  assert.equal(scenario.population, "recurrent pregnancy loss");
  assert.equal(scenario.intervention, "low-dose aspirin");
  assert.equal(scenario.comparator, "low molecular weight heparin");
  assert.ok(scenario.outcomes.some(o => o.includes("live birth")));
});

test("parseClinicalScenario deeply classifies gestational diabetes scenario", () => {
  const input = "gestational diabetes, metformin, insulin therapy, macrosomia";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "obstetrics");
  assert.equal(scenario.population, "gestational diabetes mellitus");
  assert.equal(scenario.intervention, "metformin");
  assert.equal(scenario.comparator, "insulin therapy");
});



test("outcome directionality correctly identifies adverse vs desirable endpoints", () => {
  assert.equal(getOutcomeDirection("spontaneous preterm birth before 34 weeks"), "adverse");
  assert.equal(getOutcomeDirection("perinatal mortality"), "adverse");
  assert.equal(getOutcomeDirection("disease recurrence rate"), "adverse");
  assert.equal(getOutcomeDirection("cumulative live birth rate"), "desirable");
  assert.equal(getOutcomeDirection("gestational age at delivery"), "desirable");
  assert.equal(getOutcomeDirection("pelvic pain reduction"), "desirable");
  assert.equal(getOutcomeDirection("preservation of ovarian reserve"), "desirable");
});

test("parseClinicalScenario accurately differentiates poor responders, IVF, growth hormone, and CoQ10", () => {
  const input = "poor responders, ivf, growth hormone, co enzyme q10, pregnancy rate";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "infertility");
  assert.equal(
    scenario.population,
    "poor ovarian response undergoing IVF",
    "Population must integrate condition and procedural IVF setting"
  );
  assert.equal(scenario.intervention, "growth hormone", "Growth hormone must strictly be intervention");
  assert.equal(scenario.comparator, "coenzyme Q10", "Coenzyme Q10 must strictly be comparator");
  assert.ok(
    scenario.outcomes.some(o => o.toLowerCase().includes("pregnancy rate")),
    "Outcome must include pregnancy rate"
  );

  for (const sq of scenario.suggestedQuestions) {
    assert.ok(sq.question.includes("growth hormone (I)"), "Intervention slot must contain growth hormone");
    assert.ok(sq.question.includes("coenzyme Q10 (C)"), "Comparator slot must contain coenzyme Q10");
    assert.ok(sq.question.includes("(P)"), "Must have (P) marker");
    assert.ok(sq.question.includes("(O)"), "Must have (O) marker");
    assert.ok(!sq.question.includes("co enzyme q10 (P)"), "CoQ10 must NEVER be classified as population");
    assert.ok(!sq.question.includes("growth hormone (O)"), "Growth hormone must NEVER be classified as outcome");
  }

  // Roundtrip extraction
  const extracted = extractPicoFromQuestion(scenario.suggestedQuestions[0].question, input);
  assert.equal(extracted.condition, "poor ovarian response undergoing IVF");
  assert.equal(extracted.intervention, "growth hormone");
  assert.equal(extracted.comparator, "coenzyme Q10");
});

test("R1. parseClinicalScenario canonical condition precedence over KB default (HFpEF vs HFrEF)", () => {
  // Test 1: natural language with abbreviation "hfpef"
  const q1 = "does dapagliflozin compared with placebo reduce hospitalization in patients with hfpef";
  const s1 = parseClinicalScenario(q1, "cardiology");
  assert.ok(
    s1.population.toLowerCase().includes("preserved ejection fraction"),
    `Expected population to contain 'preserved ejection fraction', got '${s1.population}'`
  );
  assert.ok(!s1.population.toLowerCase().includes("reduced ejection fraction"), "Must not default to HFrEF");

  // Test 2: natural language with full condition name
  const q2 = "does dapagliflozin compared with placebo reduce hospitalization in patients with heart failure with preserved ejection fraction";
  const s2 = parseClinicalScenario(q2, "cardiology");
  assert.ok(
    s2.population.toLowerCase().includes("preserved ejection fraction"),
    `Expected population to contain 'preserved ejection fraction', got '${s2.population}'`
  );

  // Test 3: natural language with "hfref"
  const q3 = "In patients with hfref does dapagliflozin compared with placebo reduce hospitalization";
  const s3 = parseClinicalScenario(q3, "cardiology");
  assert.ok(
    s3.population.toLowerCase().includes("reduced ejection fraction"),
    `Expected population to contain 'reduced ejection fraction', got '${s3.population}'`
  );

  // Test 4: bare "hfpef" tag
  const s4 = parseClinicalScenario("hfpef");
  assert.ok(
    s4.population.toLowerCase().includes("preserved ejection fraction"),
    `Bare 'hfpef' must resolve to preserved ejection fraction, got '${s4.population}'`
  );

  // Test 5: multi-specialty control: psychiatry sentence with word "stress" does not leak to cardiology
  const q5 = "In patients with major depressive disorder experiencing severe stress, does sertraline compared with placebo improve clinical remission?";
  const s5 = parseClinicalScenario(q5);
  assert.equal(s5.specialty, "psychiatry", "Must resolve to psychiatry");
  assert.ok(s5.population.toLowerCase().includes("major depressive disorder"), "Must resolve to depression, not cardiology");
});
