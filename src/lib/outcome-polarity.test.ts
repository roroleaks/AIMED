import test from "node:test";
import assert from "node:assert/strict";
import { getOutcomePolarity, outcomeActionVerb } from "./outcome-polarity.ts";

test("outcome-polarity: classifies harm outcomes as harm and selects 'reduce'", () => {
  const harms = [
    "preterm preeclampsia",
    "all-cause mortality",
    "CV mortality",
    "miscarriage rate",
    "treatment failure",
    "adverse events",
    "hernia recurrence",
    "rebleeding",
    "hospitalization",
    "vertebral fracture",
    "chronic pain",
    "eGFR decline",
    "stroke"
  ];

  for (const h of harms) {
    assert.equal(getOutcomePolarity(h), "harm", `Expected harm for '${h}'`);
    assert.equal(outcomeActionVerb(h), "reduce", `Expected 'reduce' for '${h}'`);
  }
});

test("outcome-polarity: classifies benefit outcomes as benefit and selects 'improve'", () => {
  const benefits = [
    "live birth rate",
    "overall survival",
    "progression-free survival",
    "health-related quality of life",
    "clinical cure",
    "mucosal healing",
    "durable skin clearance",
    "PASI 90",
    "functional recovery"
  ];

  for (const b of benefits) {
    assert.equal(getOutcomePolarity(b), "benefit", `Expected benefit for '${b}'`);
    assert.equal(outcomeActionVerb(b), "improve", `Expected 'improve' for '${b}'`);
  }
});
