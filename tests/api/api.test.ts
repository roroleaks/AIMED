import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { NextRequest } from "next/server";
import { z } from "zod";

process.env.AIMED_OFFLINE_LITERATURE = "1";
process.env.AIMED_RECORD_SECRET = "test-secret";

const { POST: enginePost } = await import("../../src/app/api/engine/route.ts");
const { POST: pdfPost } = await import("../../src/app/api/pdf/route.ts");
const { POST: docxPost } = await import("../../src/app/api/docx/route.ts");
const { composeManuscript } = await import("../../src/lib/manuscript-composer.ts");
const { buildSummaryPayload } = await import("../../src/lib/summary-payload.ts");

import type { PicoWord } from "../../src/lib/pico-roles.ts";
import type { ScreenPayload } from "../../src/lib/deterministic-screen.ts";
import type { ExploreRecord } from "../../src/lib/explore-scoring.ts";

interface ApiFixture {
  specialty: string;
  words: PicoWord[];
  screenResponse: ScreenPayload;
}

function loadJson<T>(relPath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(relPath), "utf8")) as T;
}

function makeReq(url: string, body: unknown, rawBody?: string) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  });
}

test("API-01. Malformed JSON returns 400", async () => {
  const res = await enginePost(makeReq("http://localhost:3000/api/engine", null, "{bad json"));
  assert.equal(res.status, 400);
});

test("API-02. Unknown stage returns 400 with allowed stages", async () => {
  const res = await enginePost(makeReq("http://localhost:3000/api/engine", { stage: "unknown_stage" }));
  assert.equal(res.status, 400);
  const body = await res.json();
  const text = JSON.stringify(body);
  assert.ok(text.includes("screen") && text.includes("explore") && text.includes("compose"), `Expected allowed stages in: ${text}`);
});

test("API-03. Empty, 2-word, non-clinical 'a, b, c, d', unknown specialty, and sources: [] return 400 or needsClarification", async () => {
  const cases = [
    { stage: "screen", words: [], specialty: "obgyn" },
    {
      stage: "screen",
      words: [
        { word: "IVF", role: "population" },
        { word: "live birth", role: "outcome" },
      ],
      specialty: "obgyn",
    },
    {
      stage: "screen",
      words: [
        { word: "a", role: "population" },
        { word: "b", role: "intervention" },
        { word: "c", role: "comparator" },
        { word: "d", role: "outcome" },
      ],
      specialty: "obgyn",
    },
    {
      stage: "screen",
      words: [
        { word: "IVF", role: "population" },
        { word: "PGT-A", role: "intervention" },
        { word: "morphology", role: "comparator" },
        { word: "live birth", role: "outcome" },
      ],
      specialty: "astrology_not_real",
    },
    {
      stage: "screen",
      words: [
        { word: "IVF", role: "population" },
        { word: "PGT-A", role: "intervention" },
        { word: "morphology", role: "comparator" },
        { word: "live birth", role: "outcome" },
      ],
      specialty: "obgyn",
      sources: [],
    },
  ];

  for (const payload of cases) {
    const res = await enginePost(makeReq("http://localhost:3000/api/engine", payload));
    const body = await res.json();
    assert.ok(
      res.status === 400 || body.needsClarification === true,
      `Expected 400 or needsClarification for ${JSON.stringify(payload)}, got ${res.status}: ${JSON.stringify(body)}`
    );
    assert.ok(!body.phrases, "Should never return a full evidence map for invalid input");
  }
});

test("API-04. Valid screen and explore return 200 with valid Zod schema, _sig, and searchLog", async () => {
  const words = [
    { word: "advanced non-small cell lung cancer", role: "population" },
    { word: "pembrolizumab", role: "intervention" },
    { word: "platinum chemotherapy", role: "comparator" },
    { word: "overall survival", role: "outcome" },
  ];

  const screenRes = await enginePost(
    makeReq("http://localhost:3000/api/engine", { stage: "screen", words, specialty: "oncology" })
  );
  assert.equal(screenRes.status, 200);
  const screenJson = await screenRes.json();

  const screenSchema = z.object({
    phrases: z.object({
      established: z.object({ phrase: z.string(), basis: z.string() }),
      conflicting: z.object({ phrase: z.string(), basis: z.string() }),
      gap: z.object({ phrase: z.string(), basis: z.string() }),
    }),
    corpusStats: z.object({
      retrieved: z.number(),
      screened: z.number(),
    }),
  });
  assert.ok(screenSchema.safeParse(screenJson).success, "Screen response schema invalid");

  const exploreRes = await enginePost(
    makeReq("http://localhost:3000/api/engine", {
      stage: "explore",
      choice: { category: "gap", phrase: screenJson.phrases.gap.phrase },
      words,
      specialty: "oncology",
      excluded: { userExcluded: [], seen: [] },
    })
  );
  assert.equal(exploreRes.status, 200);
  const exploreJson = await exploreRes.json();

  const exploreSchema = z.object({
    records: z.array(z.object({ _sig: z.string().min(10), title: z.string() })),
    searchLog: z.array(
      z.object({
        id: z.string(),
        ok: z.boolean(),
        count: z.number(),
        query: z.string(),
        date: z.string(),
      })
    ),
  });
  const parsedExplore = exploreSchema.safeParse(exploreJson);
  assert.ok(parsedExplore.success, `Explore schema invalid: ${JSON.stringify(parsedExplore.error?.issues)}`);
});

test("API-05. Compose with signed-genuine returns 200", async () => {
  const onc1 = loadJson<ApiFixture>("tests/fixtures/literature/ONC-1.json");
  const genuine = loadJson<ExploreRecord[]>("tests/fixtures/records/signed-genuine.json");
  const res = await enginePost(
    makeReq("http://localhost:3000/api/engine", {
      stage: "compose",
      specialty: "oncology",
      words: onc1.words,
      choice: { category: "established", phrase: onc1.screenResponse.phrases.established.phrase },
      records: genuine,
      style: "vancouver",
    })
  );
  assert.equal(res.status, 200);
});

test("API-06. Compose with unsigned-fabricated returns 422", async () => {
  const onc1 = loadJson<ApiFixture>("tests/fixtures/literature/ONC-1.json");
  const fabricated = loadJson<ExploreRecord[]>("tests/fixtures/records/unsigned-fabricated.json");
  const res = await enginePost(
    makeReq("http://localhost:3000/api/engine", {
      stage: "compose",
      specialty: "oncology",
      words: onc1.words,
      choice: { category: "established", phrase: onc1.screenResponse.phrases.established.phrase },
      records: fabricated,
      style: "vancouver",
    })
  );
  assert.equal(res.status, 422);
});

test("API-07. Compose with tampered-context or tampered-score returns 422", async () => {
  const onc1 = loadJson<ApiFixture>("tests/fixtures/literature/ONC-1.json");
  for (const file of ["tampered-context.json", "tampered-score.json"]) {
    const recs = loadJson<ExploreRecord[]>(`tests/fixtures/records/${file}`);
    const res = await enginePost(
      makeReq("http://localhost:3000/api/engine", {
        stage: "compose",
        specialty: "oncology",
        words: onc1.words,
        choice: { category: "established", phrase: onc1.screenResponse.phrases.established.phrase },
        records: recs,
        style: "vancouver",
      })
    );
    assert.equal(res.status, 422, `Expected 422 for ${file}`);
  }
});

test("API-08. /api/pdf and /api/docx with genuine signed papers return 200 and correct MIME", async () => {
  const onc1 = loadJson<ApiFixture>("tests/fixtures/literature/ONC-1.json");
  const genuine = loadJson<ExploreRecord[]>("tests/fixtures/records/signed-genuine.json");
  const choice = { category: "established" as const, phrase: onc1.screenResponse.phrases.established.phrase };
  const manuscript = composeManuscript({
    specialty: "oncology",
    words: onc1.words,
    category: choice.category,
    phrase: choice.phrase,
    screeningStats: { retrieved: 25, screened: 25, excludedCount: 0, relaxationLevel: 0 },
    records: genuine,
    style: "vancouver",
  });
  const payload = buildSummaryPayload(
    onc1.words,
    choice,
    onc1.screenResponse,
    { records: genuine, corpusStats: { retrieved: 25, screened: 25, blocked: 0, returned: genuine.length, relaxationLevel: 0 }, hasMore: false },
    { phrase: choice.phrase, category: choice.category, userExcluded: [], seen: [] },
    manuscript,
    "oncology"
  );

  const pdfRes = await pdfPost(makeReq("http://localhost:3000/api/pdf", { workflow: payload }));
  const pdfErr = pdfRes.status !== 200 ? await pdfRes.clone().text() : "";
  assert.equal(pdfRes.status, 200, `PDF status ${pdfRes.status}: ${pdfErr}`);
  assert.ok(pdfRes.headers.get("content-type")?.includes("application/pdf"));

  const docxRes = await docxPost(makeReq("http://localhost:3000/api/docx", { workflow: payload }));
  const docxErr = docxRes.status !== 200 ? await docxRes.clone().text() : "";
  assert.equal(docxRes.status, 200, `DOCX status ${docxRes.status}: ${docxErr}`);
  assert.ok(docxRes.headers.get("content-type")?.includes("wordprocessingml.document"));
});

test("API-09a. /api/pdf with unsigned-fabricated returns 422", async () => {
  const onc1 = loadJson<ApiFixture>("tests/fixtures/literature/ONC-1.json");
  const fabricated = loadJson<ExploreRecord[]>("tests/fixtures/records/unsigned-fabricated.json");
  const choice = { category: "established" as const, phrase: onc1.screenResponse.phrases.established.phrase };
  const manuscript = composeManuscript({
    specialty: "oncology",
    words: onc1.words,
    category: choice.category,
    phrase: choice.phrase,
    screeningStats: { retrieved: 1, screened: 1, excludedCount: 0, relaxationLevel: 0 },
    records: fabricated,
    style: "vancouver",
  });
  const payload = buildSummaryPayload(
    onc1.words,
    choice,
    onc1.screenResponse,
    { records: fabricated, corpusStats: { retrieved: 1, screened: 1, blocked: 0, returned: 1, relaxationLevel: 0 }, hasMore: false },
    { phrase: choice.phrase, category: choice.category, userExcluded: [], seen: [] },
    manuscript,
    "oncology"
  );

  const pdfRes = await pdfPost(makeReq("http://localhost:3000/api/pdf", { workflow: payload }));
  assert.equal(pdfRes.status, 422);
});

test("API-09b. /api/docx with unsigned-fabricated returns 422", async () => {
  const onc1 = loadJson<ApiFixture>("tests/fixtures/literature/ONC-1.json");
  const fabricated = loadJson<ExploreRecord[]>("tests/fixtures/records/unsigned-fabricated.json");
  const choice = { category: "established" as const, phrase: onc1.screenResponse.phrases.established.phrase };
  const manuscript = composeManuscript({
    specialty: "oncology",
    words: onc1.words,
    category: choice.category,
    phrase: choice.phrase,
    screeningStats: { retrieved: 1, screened: 1, excludedCount: 0, relaxationLevel: 0 },
    records: fabricated,
    style: "vancouver",
  });
  const payload = buildSummaryPayload(
    onc1.words,
    choice,
    onc1.screenResponse,
    { records: fabricated, corpusStats: { retrieved: 1, screened: 1, blocked: 0, returned: 1, relaxationLevel: 0 }, hasMore: false },
    { phrase: choice.phrase, category: choice.category, userExcluded: [], seen: [] },
    manuscript,
    "oncology"
  );

  const docxRes = await docxPost(makeReq("http://localhost:3000/api/docx", { workflow: payload }));
  assert.equal(docxRes.status, 422);
});

test("API-10. Missing AIMED_RECORD_SECRET in production mode fails closed", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
  delete env.AIMED_RECORD_SECRET;
  delete env.VERCEL;
  const res = spawnSync(
    process.execPath,
    ["-e", "import('./src/lib/record-signature.ts').then(m => m.computeRecordSignature({ title: 'x' }))"],
    { env, encoding: "utf8" }
  );
  assert.notEqual(res.status, 0, "Expected non-zero exit when AIMED_RECORD_SECRET missing in production");
  assert.ok(res.stderr.includes("AIMED_RECORD_SECRET"), `Expected clear error message, got: ${res.stderr}`);
});

test("API-11. Cross-instance signature verification succeeds with shared secret", () => {
  const env = { ...process.env, AIMED_RECORD_SECRET: "cross-instance-secret" };
  const signOut = spawnSync(
    process.execPath,
    ["-e", "import('./src/lib/record-signature.ts').then(m => console.log(JSON.stringify(m.signRecord({ pmid: '123', title: 'Test' }))))"],
    { env, encoding: "utf8" }
  );
  assert.equal(signOut.status, 0);
  const signedJson = signOut.stdout.trim();

  const verifyOut = spawnSync(
    process.execPath,
    ["-e", `import('./src/lib/record-signature.ts').then(m => { const ok = m.verifyRecordSignature(${signedJson}); if (!ok) process.exit(1); })`],
    { env, encoding: "utf8" }
  );
  assert.equal(verifyOut.status, 0, "Fresh process with same secret must verify signature");
});

test("API-12. Response headers include x-aimed-source and no secrets in body", async () => {
  const res = await enginePost(
    makeReq("http://localhost:3000/api/engine", {
      stage: "screen",
      words: [
        { word: "sepsis", role: "population" },
        { word: "balanced crystalloids", role: "intervention" },
        { word: "saline", role: "comparator" },
        { word: "mortality", role: "outcome" },
      ],
      specialty: "internal_med",
    })
  );
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("x-aimed-source"), "Expected x-aimed-source header");
  const bodyText = await res.text();
  assert.ok(!bodyText.includes("test-secret"), "Secret must not appear in response body");
});
