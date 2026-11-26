import test from "node:test";
import assert from "node:assert/strict";
import { SPECIALTIES, keywordsPlaceholderFor } from "./specialties.ts";

test("PH1. only Obs/Gyn shows the endometriosis example; every specialty has its own", () => {
  const seen = new Set<string>();
  for (const spec of Object.values(SPECIALTIES)) {
    const text = keywordsPlaceholderFor(spec);
    assert.match(text, /^e\.g\. /);
    if (spec.id !== "obgyn") assert.doesNotMatch(text, /endometriosis/i, spec.id);
    seen.add(text);
  }
  assert.equal(seen.size, Object.keys(SPECIALTIES).length);
});
