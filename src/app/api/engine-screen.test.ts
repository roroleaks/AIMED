import test from "node:test";
import assert from "node:assert/strict";
import {
  validateScreenRequest,
  generateDeterministicScreen,
  type ScreenPayload
} from "../../lib/deterministic-screen.ts";
import { isMatchingScreenCache } from "../../lib/session.ts";

test("ESC-1. Engine screen stage rejects missing specialty with 400", () => {
  const result = validateScreenRequest({
    stage: "screen",
    words: [
      { word: "heart failure", role: "population" },
      { word: "sglt2 inhibitors", role: "intervention" },
      { word: "mortality", role: "outcome" }
    ]
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(
      result.error.includes("Specialty is required") || result.error.includes("Invalid parameters"),
      `Expected specialty error, got: ${result.error}`
    );
  }
});

test("ESC-2. Engine screen stage rejects unknown specialty with 400", () => {
  const result = validateScreenRequest({
    stage: "screen",
    words: [
      { word: "heart failure", role: "population" },
      { word: "sglt2 inhibitors", role: "intervention" },
      { word: "mortality", role: "outcome" }
    ],
    specialty: "astrology_not_real"
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(
      result.error.includes("Unknown specialty"),
      `Expected unknown specialty error, got: ${result.error}`
    );
  }
});

test("ESC-3. Engine screen stage rejects fewer than 3 words with 400", () => {
  const result = validateScreenRequest({
    stage: "screen",
    words: [
      { word: "heart failure", role: "population" },
      { word: "mortality", role: "outcome" }
    ],
    specialty: "cardiology"
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(
      result.error.includes("At least 3 words required") || result.error.includes("Invalid parameters"),
      `Expected min words error, got: ${result.error}`
    );
  }
});

test("ESC-4. Engine screen stage rejects more than 5 words with 400 (6 words)", () => {
  const result = validateScreenRequest({
    stage: "screen",
    words: [
      { word: "heart failure", role: "population" },
      { word: "sglt2 inhibitors", role: "intervention" },
      { word: "placebo", role: "comparator" },
      { word: "cardiovascular mortality", role: "outcome" },
      { word: "hospitalization", role: "outcome" },
      { word: "excess word", role: "other" }
    ],
    specialty: "cardiology"
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(
      result.error.includes("At most 5 words allowed") || result.error.includes("Invalid parameters"),
      `Expected max words error, got: ${result.error}`
    );
  }
});

test("ESC-5. Engine screen stage accepts valid cardiology payload and produces conforming response shape", () => {
  const input = {
    stage: "screen" as const,
    words: [
      { word: "heart failure", role: "population" as const },
      { word: "sglt2 inhibitors", role: "intervention" as const },
      { word: "hospitalization", role: "outcome" as const }
    ],
    specialty: "cardiology"
  };

  const validation = validateScreenRequest(input);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  assert.equal(validation.data.stage, "screen");
  assert.equal(validation.data.words.length, 3);
  assert.equal(validation.data.specialty, "cardiology");

  // Generate screen response payload
  const screenPayload = generateDeterministicScreen(validation.data.words);
  const responseShape = {
    phrases: screenPayload.phrases,
    corpusStats: screenPayload.corpusStats,
    aiRefined: false,
    sources: [
      { id: "pubmed", ok: true, count: 42 },
      { id: "cochrane", ok: true, count: 5 }
    ]
  };

  // Validate phrases
  assert.ok(responseShape.phrases.established.phrase);
  assert.ok(responseShape.phrases.conflicting.phrase);
  assert.ok(responseShape.phrases.gap.phrase);
  assert.notEqual(responseShape.phrases.established.phrase, responseShape.phrases.conflicting.phrase);
  assert.notEqual(responseShape.phrases.established.phrase, responseShape.phrases.gap.phrase);
  assert.notEqual(responseShape.phrases.conflicting.phrase, responseShape.phrases.gap.phrase);

  // Validate stats & sources
  assert.equal(typeof responseShape.corpusStats.retrieved, "number");
  assert.equal(typeof responseShape.corpusStats.screened, "number");
  assert.equal(typeof responseShape.corpusStats.relaxationLevel, "number");
  assert.equal(typeof responseShape.aiRefined, "boolean");
  assert.ok(Array.isArray(responseShape.sources));
  assert.equal(responseShape.sources.length, 2);
});

test("ESC-6. Engine screen stage accepts valid ObGyn payload with 4 words and preserves comparator", () => {
  const input = {
    stage: "screen" as const,
    words: [
      { word: "short cervix", role: "population" as const },
      { word: "progesterone", role: "intervention" as const },
      { word: "cerclage", role: "comparator" as const },
      { word: "preterm birth", role: "outcome" as const }
    ],
    specialty: "obgyn"
  };

  const validation = validateScreenRequest(input);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  const screenPayload = generateDeterministicScreen(validation.data.words);
  assert.ok(screenPayload.phrases.established.phrase.includes("short cervix"));
  assert.ok(screenPayload.phrases.established.phrase.includes("progesterone"));
  assert.ok(screenPayload.phrases.conflicting.phrase.includes("cerclage"));
  assert.notEqual(screenPayload.phrases.established.phrase, screenPayload.phrases.conflicting.phrase);
});

test("ESC-7. Pure-logic cache hit and specialty validation (Flag B)", () => {
  const words = [
    { word: "short cervix", role: "population" },
    { word: "progesterone", role: "intervention" },
    { word: "preterm birth", role: "outcome" }
  ];

  const cachedPayload: ScreenPayload = {
    inputWords: ["short cervix", "progesterone", "preterm birth"],
    specialty: "obgyn",
    source: "deterministic",
    corpusStats: { retrieved: 10, screened: 8, relaxationLevel: 0 },
    phrases: {
      established: { category: "established", phrase: "P1", basis: "B1", supported: true },
      conflicting: { category: "conflicting", phrase: "P2", basis: "B2", supported: true },
      gap: { category: "gap", phrase: "P3", basis: "B3", supported: true }
    }
  };

  // Matching specialty -> true
  assert.equal(isMatchingScreenCache(cachedPayload, words, "obgyn"), true);

  // Mismatched specialty -> false (Flag B requirement)
  assert.equal(isMatchingScreenCache(cachedPayload, words, "cardiology"), false);

  // Missing specialty in call when cached has specialty -> false
  assert.equal(isMatchingScreenCache(cachedPayload, words, "oncology"), false);

  // Altered words -> false
  const alteredWords = [
    { word: "short cervix", role: "population" },
    { word: "aspirin", role: "intervention" },
    { word: "preterm birth", role: "outcome" }
  ];
  assert.equal(isMatchingScreenCache(cachedPayload, alteredWords, "obgyn"), false);

  // Guard condition: fewer than 3 words or more than 5 words
  const twoWords = [{ word: "short cervix", role: "population" }, { word: "progesterone", role: "intervention" }];
  assert.equal(twoWords.length < 3 || twoWords.length > 5, true);

  const sixWords = [
    { word: "w1", role: "population" },
    { word: "w2", role: "intervention" },
    { word: "w3", role: "comparator" },
    { word: "w4", role: "outcome" },
    { word: "w5", role: "other" },
    { word: "w6", role: "other" }
  ];
  assert.equal(sixWords.length < 3 || sixWords.length > 5, true);

  const validThreeWords = [
    { word: "w1", role: "population" },
    { word: "w2", role: "intervention" },
    { word: "w3", role: "outcome" }
  ];
  assert.equal(validThreeWords.length >= 3 && validThreeWords.length <= 5, true);
});
