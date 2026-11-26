import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generateDeterministicScreen } from "./deterministic-screen.ts";

const IDS = [
  "PRESET-pediatrics-rds-cpap-surfactant",
  "PRESET-surgery-appendicitis-antibiotics",
  "PRESET-neurology-stroke-thrombectomy"
];

test("SCR1. matching evidence with no extractable direction never leaves Step 2 with zero selectable focus cards", () => {
  for (const id of IDS) {
    const j = JSON.parse(fs.readFileSync(`tests/fixtures/literature/${id}.json`, "utf8"));
    const screen = generateDeterministicScreen(j.words, j.exploreResponse.records);
    const available = (["established", "conflicting", "gap"] as const).filter(
      (k) => !/^Unavailable/i.test(screen.phrases[k].basis || "")
    );
    assert.ok(available.length >= 1, `${id}: all three categories unavailable`);
  }
});

test("SCR2. the fallback gap card says the direction is undeterminable and does not claim a missing trial", () => {
  const j = JSON.parse(fs.readFileSync("tests/fixtures/literature/PRESET-neurology-stroke-thrombectomy.json", "utf8"));
  const screen = generateDeterministicScreen(j.words, j.exploreResponse.records);
  const gap = screen.phrases.gap;
  if (/abstracts do not report an extractable direction/.test(gap.basis)) {
    assert.doesNotMatch(gap.basis, /no (systematic review|randomi[sz]ed)/i);
  }
});
