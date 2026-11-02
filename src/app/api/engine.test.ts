import test from "node:test";
import assert from "node:assert/strict";

test("commentary response surfaces telemetry with positive processingTimeMs", { skip: !process.env.AIMED_LIVE_NETWORK }, async () => {
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
  assert.ok(body.telemetry, "telemetry must be present");
  assert.ok(body.telemetry.processingTimeMs > 0, "processingTimeMs must be positive");
  assert.ok(["llm", "deterministic"].includes(body.telemetry.pathUsed), "pathUsed must be llm or deterministic");
});
