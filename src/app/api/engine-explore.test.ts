import test from "node:test";
import assert from "node:assert/strict";
import {
  validateExploreRequest,
  filterExcludedRecords,
  scoreRecords,
  type ExploreRecord
} from "../../lib/explore-scoring.ts";
import type { AuditableRef } from "../../lib/relevance.ts";

test("EEX-1. Engine explore stage rejects missing choice with 400", () => {
  const result = validateExploreRequest({
    stage: "explore",
    words: [
      { word: "heart failure", role: "population" },
      { word: "sglt2 inhibitors", role: "intervention" },
      { word: "hospitalization", role: "outcome" }
    ],
    specialty: "cardiology"
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(result.error.includes("Invalid parameters"));
  }
});

test("EEX-2. Engine explore stage rejects fewer than 3 words with 400", () => {
  const result = validateExploreRequest({
    stage: "explore",
    choice: {
      category: "established",
      phrase: "In heart failure (P), does sglt2 inhibitors (I) reduce hospitalization (O)?"
    },
    words: [
      { word: "heart failure", role: "population" },
      { word: "hospitalization", role: "outcome" }
    ],
    specialty: "cardiology"
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(result.error.includes("At least 3 words required") || result.error.includes("Invalid parameters"));
  }
});

test("EEX-3. Engine explore stage rejects more than 5 words with 400 (6 words)", () => {
  const result = validateExploreRequest({
    stage: "explore",
    choice: {
      category: "established",
      phrase: "In heart failure (P), does sglt2 inhibitors (I) reduce hospitalization (O)?"
    },
    words: [
      { word: "w1", role: "population" },
      { word: "w2", role: "intervention" },
      { word: "w3", role: "comparator" },
      { word: "w4", role: "outcome" },
      { word: "w5", role: "other" },
      { word: "w6", role: "other" }
    ],
    specialty: "cardiology"
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(result.error.includes("At most 5 words allowed") || result.error.includes("Invalid parameters"));
  }
});

test("EEX-4. Engine explore stage rejects unknown specialty with 400", () => {
  const result = validateExploreRequest({
    stage: "explore",
    choice: {
      category: "established",
      phrase: "In heart failure (P), does sglt2 inhibitors (I) compared with placebo (C) reduce hospitalization (O)?"
    },
    words: [
      { word: "heart failure", role: "population" },
      { word: "sglt2 inhibitors", role: "intervention" },
      { word: "hospitalization", role: "outcome" }
    ],
    specialty: "astrology_not_real"
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(result.error.includes("Unknown specialty"));
  }
});

test("EEX-5. Engine explore stage rejects phrase that does not cover submitted words with 400", () => {
  const result = validateExploreRequest({
    stage: "explore",
    choice: {
      category: "established",
      // Completely misses "progesterone" and "preterm birth"
      phrase: "In women with hypertension (P), does aspirin (I) compared with placebo (C) reduce stroke (O)?"
    },
    words: [
      { word: "short cervix", role: "population" },
      { word: "progesterone", role: "intervention" },
      { word: "preterm birth", role: "outcome" }
    ],
    specialty: "obgyn"
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(result.error.includes("Phrase does not contain submitted word"));
  }
});

test("EEX-6. Engine explore stage accepts valid payload and produces conforming response shape", () => {
  const input = {
    stage: "explore" as const,
    choice: {
      category: "established" as const,
      phrase: "In patients with heart failure (P), does sglt2 inhibitors (I) compared with placebo (C) reduce hospitalization (O)?"
    },
    words: [
      { word: "heart failure", role: "population" as const },
      { word: "sglt2 inhibitors", role: "intervention" as const },
      { word: "hospitalization", role: "outcome" as const }
    ],
    specialty: "cardiology",
    excluded: {
      userExcluded: ["p:9999"],
      seen: ["p:8888"]
    }
  };

  const validation = validateExploreRequest(input);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  const fixtureCorpus: AuditableRef[] = [
    {
      pmid: "1001",
      title: "SGLT2 inhibitors reduce hospitalization in heart failure",
      journal: "JACC",
      year: "2023",
      context: "Heart failure hospitalization significantly reduced with SGLT2 inhibitors vs placebo."
    },
    {
      pmid: "9999",
      title: "Blocked paper on heart failure",
      year: "2020"
    }
  ];

  const blockedKeys = [...(input.excluded.userExcluded || []), ...(input.excluded.seen || [])];
  const scoredResult = scoreRecords(fixtureCorpus, input.choice.phrase, input.choice.category, blockedKeys);

  const response = {
    records: scoredResult.scored,
    corpusStats: {
      retrieved: fixtureCorpus.length,
      screened: scoredResult.scored.length + scoredResult.removedByBlock,
      blocked: scoredResult.removedByBlock,
      returned: scoredResult.scored.length,
      relaxationLevel: 0
    },
    sources: [
      { id: "pubmed", ok: true, count: 1 }
    ],
    hasMore: false
  };

  assert.equal(response.records.length, 1);
  assert.equal(response.records[0].pmid, "1001");
  assert.equal(response.corpusStats.blocked, 1);
  assert.equal(response.corpusStats.returned, 1);
  assert.equal(typeof response.hasMore, "boolean");
});

test("EEX-7. 0-overlap exclusion filter guarantee: records in userExcluded ∪ seen never survive", () => {
  const records: ExploreRecord[] = [
    {
      pmid: "101",
      title: "Dapagliflozin in Heart Failure with Reduced Ejection Fraction",
      year: "2020",
      relevancePct: 95,
      matchedElements: ["P", "I", "O"]
    },
    {
      pmid: "102",
      title: "Empagliflozin in Heart Failure with Preserved Ejection Fraction",
      year: "2021",
      relevancePct: 90,
      matchedElements: ["P", "I", "O"]
    },
    {
      pmid: "103",
      title: "Sotagliflozin in Patients with Diabetes and Recent Worsening Heart Failure",
      year: "2021",
      relevancePct: 88,
      matchedElements: ["P", "I", "O"]
    }
  ];

  // Exclude paper 101 by normalized title and paper 102 by pmid key
  const userExcluded = ["  dapagliflozin in heart failure with reduced ejection fraction  "];
  const seen = ["p:102"];

  const { surviving, blockedCount } = filterExcludedRecords(records, userExcluded, seen);

  assert.equal(blockedCount, 2);
  assert.equal(surviving.length, 1);
  assert.equal(surviving[0].pmid, "103");

  // Re-run guarantee: ZERO overlap
  const allExcludedOrSeen = new Set([
    ...userExcluded.map(t => t.trim().toLowerCase()),
    ...seen.map(s => s.trim().toLowerCase()),
    "101",
    "102"
  ]);

  for (const s of surviving) {
    assert.ok(!allExcludedOrSeen.has((s.title || "").toLowerCase()));
    assert.ok(!allExcludedOrSeen.has(s.pmid || ""));
    assert.ok(!allExcludedOrSeen.has("p:" + (s.pmid || "")));
  }
});
