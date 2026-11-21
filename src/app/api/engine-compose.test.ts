import test from "node:test";
import assert from "node:assert/strict";
import {
  validateComposeRequest,
  composeManuscript,
  validateEnrichedManuscript,
  type ComposeStageInput
} from "../../lib/manuscript-composer.ts";
import type { ExploreRecord } from "../../lib/explore-scoring.ts";

const sampleInput: ComposeStageInput = {
  stage: "compose",
  specialty: "obgyn",
  words: [
    { word: "cervical insufficiency", role: "population" },
    { word: "cerclage", role: "intervention" },
    { word: "expectant management", role: "comparator" },
    { word: "preterm birth", role: "outcome" }
  ],
  choice: {
    category: "conflicting",
    phrase: "In cervical insufficiency (P), does cerclage (I) compared with expectant management (C) reduce preterm birth (O)?"
  },
  screeningStats: {
    retrieved: 50,
    screened: 50,
    relaxationLevel: 0,
    excludedCount: 1
  },
  records: [
    {
      title: "Cervical cerclage for prevention of preterm birth in singleton pregnancies: a randomized trial",
      authors: "Berghella V, Odibo AO, Tolosa JE",
      journal: "Obstet Gynecol",
      year: "2021",
      pmid: "32000001",
      doi: "10.1097/AOG.0000000000004123",
      relevancePct: 94
    },
    {
      title: "Expectant management versus intervention in cervical shortening",
      authors: "Smith R, Jones K",
      journal: "Am J Obstet Gynecol",
      year: "2020",
      pmid: "32000002",
      doi: "10.1016/j.ajog.2020.05.011",
      relevancePct: 82
    }
  ],
  userExcluded: [],
  style: "vancouver"
};

test("EC1. Invalid parameters or missing required fields return 400", () => {
  const result = validateComposeRequest({ stage: "compose" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(result.error.includes("Invalid parameters"));
  }
});

test("EC2. Unknown specialty returns 400", () => {
  const result = validateComposeRequest({
    ...sampleInput,
    specialty: "astrology"
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(result.error.includes("Unknown specialty: astrology"));
  }
});

test("EC3. Fewer than 3 words returns 400", () => {
  const result = validateComposeRequest({
    ...sampleInput,
    words: [
      { word: "cervical insufficiency", role: "population" },
      { word: "preterm birth", role: "outcome" }
    ]
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.ok(result.error.includes("At least 3 words required") || result.error.includes("Invalid parameters"));
  }
});

test("EC4. Valid compose input passes validation with ok: true", () => {
  const result = validateComposeRequest(sampleInput);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.specialty, "obgyn");
    assert.equal(result.data.choice.category, "conflicting");
    assert.equal(result.data.records.length, 2);
  }
});

test("EC5. Server-side pipeline builds deterministic manuscript correctly", () => {
  const validated = validateComposeRequest(sampleInput);
  assert.ok(validated.ok);
  if (validated.ok) {
    const manuscript = composeManuscript({
      words: validated.data.words,
      category: validated.data.choice.category,
      phrase: validated.data.choice.phrase,
      screeningStats: {
        retrieved: validated.data.screeningStats?.retrieved ?? 0,
        screened: validated.data.screeningStats?.screened ?? 0,
        relaxationLevel: validated.data.screeningStats?.relaxationLevel ?? 0,
        excludedCount: validated.data.screeningStats?.excludedCount ?? 0
      },
      records: validated.data.records as ExploreRecord[],
      userExcluded: validated.data.userExcluded || [],
      specialty: validated.data.specialty,
      style: validated.data.style
    });

    assert.ok(manuscript.title.includes("Conflicting Clinical Findings"));
    assert.equal(manuscript.abstract.length, 4);
    assert.equal(manuscript.sections.length, 5);
    assert.equal(manuscript.sections[0].heading, "Background");
    assert.equal(manuscript.sections[1].heading, "Search strategy and screening");
    assert.equal(manuscript.sections[2].heading, "Evidence synthesis");
    assert.equal(manuscript.sections[3].heading, "Limitations");
    assert.equal(manuscript.sections[4].heading, "Conclusion");
    assert.equal(manuscript.references.length, 2);
    assert.equal(manuscript.aiEnriched, false);
  }
});

test("EC6. Respects citation style option and omits excluded records", () => {
  const validated = validateComposeRequest({
    ...sampleInput,
    style: "apa",
    userExcluded: ["32000002"]
  });
  assert.ok(validated.ok);
  if (validated.ok) {
    const manuscript = composeManuscript({
      words: validated.data.words,
      category: validated.data.choice.category,
      phrase: validated.data.choice.phrase,
      screeningStats: {
        retrieved: validated.data.screeningStats?.retrieved ?? 0,
        screened: validated.data.screeningStats?.screened ?? 0,
        relaxationLevel: validated.data.screeningStats?.relaxationLevel ?? 0,
        excludedCount: validated.data.userExcluded?.length ?? 0
      },
      records: validated.data.records as ExploreRecord[],
      userExcluded: validated.data.userExcluded || [],
      specialty: validated.data.specialty,
      style: validated.data.style
    });

    assert.equal(manuscript.citationStyle, "apa");
    assert.equal(manuscript.references.length, 1);
    assert.ok(manuscript.references[0].startsWith("Berghella, V., Odibo, A.O., & Tolosa, J.E. (2021)."));
    assert.ok(!JSON.stringify(manuscript).includes("Smith R"), "Excluded record must not appear");
  }
});

test("EC7. LLM hard validation rejects fabricated findings or invalid structures", () => {
  const validated = validateComposeRequest(sampleInput);
  assert.ok(validated.ok);
  if (validated.ok) {
    const deterministic = composeManuscript({
      words: validated.data.words,
      category: validated.data.choice.category,
      phrase: validated.data.choice.phrase,
      screeningStats: {
        retrieved: 50,
        screened: 50,
        relaxationLevel: 0,
        excludedCount: 1
      },
      records: validated.data.records as ExploreRecord[],
      userExcluded: [],
      specialty: validated.data.specialty,
      style: "vancouver"
    });

    // Valid mock enrichment
    const validAi = {
      title: deterministic.title,
      abstract: deterministic.abstract,
      sections: deterministic.sections
    };
    const passed = validateEnrichedManuscript(validAi, deterministic, validated.data.records as ExploreRecord[], "vancouver");
    assert.ok(passed !== null);
    assert.equal(passed?.aiEnriched, true);

    // Corrupted with external links
    const invalidAi = {
      ...validAi,
      sections: deterministic.sections.map((s, idx) =>
        idx === 0
          ? { ...s, paragraphs: [s.paragraphs[0] + " See https://unverified.com"] }
          : s
      )
    };
    const rejected = validateEnrichedManuscript(invalidAi, deterministic, validated.data.records as ExploreRecord[], "vancouver");
    assert.equal(rejected, null);
  }
});
