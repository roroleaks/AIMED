import assert from "node:assert/strict";
import { test } from "node:test";

test("cardiology PICO retrieves the DAPA-HF landmark trial", { skip: !process.env.AIMED_LIVE_NETWORK }, async () => {
  const res = await fetch("http://localhost:3000/api/engine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage: "commentary",
      specialty: "cardiology",
      input: "In patients with HFrEF, does dapagliflozin vs placebo reduce cardiovascular mortality?",
      condition: "heart failure with reduced ejection fraction",
      intervention: "dapagliflozin",
      comparator: "placebo",
      outcome: "cardiovascular mortality",
      age: "60",
      sex: "Male",
    }),
  });
  const body = await res.json();
  assert.ok((body.retrievedCount || 0) >= 20, `retrievedCount should be >= 20, got ${body.retrievedCount}`);
  assert.ok((body.retainedCount || 0) >= 4, `retainedCount should be >= 4, got ${body.retainedCount}`);
  const refs = (body.references || []).map((r: unknown) => typeof r === "string" ? r : ((r as { title?: string }).title || "")).map((s: string) => s.toLowerCase());
  const hasDapaHF = refs.some((t: string) => t.includes("dapagliflozin") && t.includes("heart failure"));
  assert.ok(hasDapaHF, "expected at least one reference with 'dapagliflozin' and 'heart failure' in title");
});
