import assert from "node:assert/strict";
import { test } from "node:test";

test("cardiology PICO retrieves the DAPA-HF landmark trial (explore stage)", { skip: !process.env.AIMED_LIVE_NETWORK }, async () => {
  const baseUrl = process.env.AIMED_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/engine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage: "explore",
      specialty: "cardiology",
      words: [
        { word: "heart failure", role: "population" },
        { word: "dapagliflozin", role: "intervention" },
        { word: "placebo", role: "comparator" },
        { word: "cardiovascular mortality", role: "outcome" }
      ],
      choice: {
        category: "established",
        phrase: "In heart failure (P), is dapagliflozin (I) superior to placebo (C) for cardiovascular mortality (O)?"
      }
    }),
  });
  const body = await res.json();
  assert.ok((body.corpusStats?.retrieved || 0) >= 10, `retrieved should be >= 10, got ${body.corpusStats?.retrieved}`);
  const records = (body.records || []) as Array<{ title?: string }>;
  const hasDapaHF = records.some(r => (r.title || "").toLowerCase().includes("dapagliflozin") && (r.title || "").toLowerCase().includes("heart failure"));
  assert.ok(hasDapaHF, "expected at least one record with 'dapagliflozin' and 'heart failure' in title");
});
