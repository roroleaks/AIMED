import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

const stageSchema = z.object({
  stage: z.enum(["screen", "explore", "compose"]),
});

test("ENG-1. Engine route accepts only screen, explore, or compose stages", () => {
  assert.ok(stageSchema.safeParse({ stage: "screen" }).success);
  assert.ok(stageSchema.safeParse({ stage: "explore" }).success);
  assert.ok(stageSchema.safeParse({ stage: "compose" }).success);
  assert.equal(stageSchema.safeParse({ stage: "intent" }).success, false);
  assert.equal(stageSchema.safeParse({ stage: "gap" }).success, false);
  assert.equal(stageSchema.safeParse({ stage: "commentary" }).success, false);
  assert.equal(stageSchema.safeParse({ stage: "clarify" }).success, false);
  assert.equal(stageSchema.safeParse({ stage: "formulate" }).success, false);
});
