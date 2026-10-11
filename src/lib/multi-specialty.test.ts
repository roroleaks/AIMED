import test from "node:test";
import assert from "node:assert/strict";
import { parseClinicalScenario } from "./clinical-semantics.ts";
import { KB, rationalOutcomes, type SpecialtyKey } from "./kb.ts";
import { SPECIALTIES, getSpecialtyDefinition } from "./specialties.ts";

test("KB contains all major medical specialties with comprehensive data", () => {
  const expectedSpecialties: SpecialtyKey[] = [
    "obgyn", "cardiology", "oncology", "pediatrics",
    "surgery", "internal_med", "neurology", "endocrinology",
    "infertility", "gynecology", "obstetrics"
  ];

  for (const s of expectedSpecialties) {
    assert.ok(s in KB, `Specialty ${s} must be present in KB`);
    const spec = KB[s];
    assert.ok(spec.label.length > 0, `${s} must have a non-empty label`);
    assert.ok(spec.conditions.length >= 5, `${s} must have at least 5 defined conditions`);
    assert.ok(spec.interventions.length >= 5, `${s} must have at least 5 defined interventions`);
    assert.ok(spec.outcomesRanked.length >= 3, `${s} must have at least 3 ranked outcomes`);
  }
});

test("parseClinicalScenario classifies Cardiology PICO scenario correctly", () => {
  const input = "heart failure, sglt2 inhibitors, placebo, cardiovascular death, hospitalization";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "cardiology");
  assert.ok(scenario.population.includes("heart failure"));
  assert.equal(scenario.intervention, "SGLT2 inhibitors");
  assert.equal(scenario.comparator, "placebo");
  assert.ok(scenario.outcomes.some(o => o.includes("death") || o.includes("hospitalization") || o.includes("mortality")));

  for (const q of scenario.suggestedQuestions) {
    assert.ok(q.question.includes("(P)") && q.question.includes("(I)") && q.question.includes("(C)") && q.question.includes("(O)"));
    assert.ok(q.question.includes("SGLT2 inhibitors (I)"));
  }
});

test("parseClinicalScenario classifies Oncology PICO scenario correctly", () => {
  const input = "non-small cell lung cancer, pembrolizumab, platinum chemotherapy, overall survival";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "oncology");
  assert.ok(scenario.population.includes("lung cancer"));
  assert.equal(scenario.intervention, "pembrolizumab");
  assert.equal(scenario.comparator, "platinum chemotherapy");
  assert.ok(scenario.outcomes.some(o => o.includes("survival")));
});

test("parseClinicalScenario classifies Neurology acute stroke scenario correctly", () => {
  const input = "acute ischemic stroke, mechanical thrombectomy, alteplase, functional recovery";
  const scenario = parseClinicalScenario(input);

  assert.equal(scenario.specialty, "neurology");
  assert.ok(scenario.population.includes("stroke"));
  assert.equal(scenario.intervention, "mechanical thrombectomy");
  assert.ok(scenario.outcomes.some(o => o.includes("functional") || o.includes("mRS") || o.includes("recovery")));
});

test("parseClinicalScenario respects explicitSpecialty parameter", () => {
  const input = "laparoscopic surgery, open surgery, wound infection";
  const scenario = parseClinicalScenario(input, "surgery");

  assert.equal(scenario.specialty, "surgery");
  assert.ok(scenario.intervention.includes("surgery") || scenario.intervention.includes("laparoscopic"));
});

test("getSpecialtyDefinition returns rich presets and guidelines for every specialty", () => {
  for (const key of Object.keys(SPECIALTIES)) {
    const def = getSpecialtyDefinition(key);
    assert.ok(def.authorityGuidelines.length > 0, `Guidelines authority missing for ${key}`);
    assert.ok(def.presets.length >= 2, `Presets missing for ${key}`);
    for (const preset of def.presets) {
      assert.ok(preset.p && preset.i && preset.c && preset.o && preset.raw, `Malformed preset in ${key}`);
    }
  }
});
