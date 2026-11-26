import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

process.env.AIMED_LIVE_NETWORK = "1";
process.env.AIMED_OFFLINE_LITERATURE = "0";
if (!process.env.AIMED_RECORD_SECRET) {
  process.env.AIMED_RECORD_SECRET = "test-secret";
}

const { POST } = await import("../src/app/api/engine/route.ts");
const { SPECIALTIES } = await import("../src/lib/specialties.ts");

const OUT_DIR = path.resolve("tests/fixtures/literature");
fs.mkdirSync(OUT_DIR, { recursive: true });

const CORE_SCENARIOS = [
  {
    id: "ART-1",
    specialty: "obgyn",
    words: [
      { word: "IVF patients", role: "population" },
      { word: "artificial intelligence embryo selection", role: "intervention" },
      { word: "embryologist morphological assessment", role: "comparator" },
      { word: "live birth", role: "outcome" },
    ],
  },
  {
    id: "ART-2",
    specialty: "obgyn",
    words: [
      { word: "women aged 35-40 undergoing IVF", role: "population" },
      { word: "PGT-A", role: "intervention" },
      { word: "morphology-based blastocyst selection", role: "comparator" },
      { word: "cumulative live birth rate", role: "outcome" },
    ],
  },
  {
    id: "ART-3",
    specialty: "obgyn",
    words: [
      { word: "recurrent implantation failure", role: "population" },
      { word: "endometrial receptivity array", role: "intervention" },
      { word: "standard timing embryo transfer", role: "comparator" },
      { word: "live birth rate", role: "outcome" },
    ],
  },
  {
    id: "OB-1",
    specialty: "obgyn",
    words: [
      { word: "high-risk pregnancy", role: "population" },
      { word: "low-dose aspirin", role: "intervention" },
      { word: "placebo", role: "comparator" },
      { word: "preterm preeclampsia", role: "outcome" },
    ],
  },
  {
    id: "IM-1",
    specialty: "internal_med",
    words: [
      { word: "sepsis", role: "population" },
      { word: "balanced crystalloids", role: "intervention" },
      { word: "saline", role: "comparator" },
      { word: "mortality", role: "outcome" },
    ],
  },
  {
    id: "ONC-1",
    specialty: "oncology",
    words: [
      { word: "advanced non-small cell lung cancer", role: "population" },
      { word: "pembrolizumab", role: "intervention" },
      { word: "platinum chemotherapy", role: "comparator" },
      { word: "overall survival", role: "outcome" },
    ],
  },
  {
    id: "SURG-1",
    specialty: "surgery",
    words: [
      { word: "uncomplicated appendicitis", role: "population" },
      { word: "antibiotics", role: "intervention" },
      { word: "appendectomy", role: "comparator" },
      { word: "treatment failure", role: "outcome" },
    ],
  },
  {
    id: "ADV-HOMEO",
    specialty: "obgyn",
    words: [
      { word: "IVF", role: "population" },
      { word: "homeopathy", role: "intervention" },
      { word: "placebo", role: "comparator" },
      { word: "live birth", role: "outcome" },
    ],
  },
  {
    id: "ADV-VAGUE",
    specialty: "obgyn",
    words: [
      { word: "pain", role: "population" },
      { word: "drug", role: "intervention" },
      { word: "better", role: "comparator" },
      { word: "patients", role: "outcome" },
    ],
  },
];

async function callEngine(body) {
  const req = new NextRequest("http://localhost:3000/api/engine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, body: json };
}

async function recordScenario(sc, resume = false) {
  const outPath = path.join(OUT_DIR, `${sc.id}.json`);
  if (resume && fs.existsSync(outPath)) {
    console.log(`Skipping existing ${sc.id}`);
    return;
  }

  console.log(`Recording ${sc.id} (${sc.specialty})...`);
  const screenRequest = {
    stage: "screen",
    words: sc.words,
    specialty: sc.specialty,
  };
  const screenRes = await callEngine(screenRequest);

  let exploreRequest = null;
  let exploreRes = null;

  if (screenRes.status === 200 && screenRes.body?.phrases) {
    const phrases = screenRes.body.phrases;
    const order = ["established", "conflicting", "gap"];
    let chosenCat = order.find(
      (c) => phrases[c] && !String(phrases[c].basis || "").toLowerCase().startsWith("unavailable")
    );
    if (!chosenCat) chosenCat = "gap";
    const chosenPhrase = phrases[chosenCat]?.phrase;
    if (chosenPhrase) {
      exploreRequest = {
        stage: "explore",
        choice: { category: chosenCat, phrase: chosenPhrase },
        words: sc.words,
        specialty: sc.specialty,
        excluded: { userExcluded: [], seen: [] },
      };
      exploreRes = await callEngine(exploreRequest);
    }
  }

  const fixture = {
    id: sc.id,
    recordedAt: new Date().toISOString(),
    specialty: sc.specialty,
    words: sc.words,
    screenRequest,
    screenStatus: screenRes.status,
    screenResponse: screenRes.body,
    exploreRequest,
    exploreStatus: exploreRes?.status ?? null,
    exploreResponse: exploreRes?.body ?? null,
  };

  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(
    `  -> ${sc.id}: screen=${screenRes.status} (retrieved=${screenRes.body?.corpusStats?.retrieved ?? 0}), explore=${exploreRes?.status ?? "skip"} (records=${exploreRes?.body?.records?.length ?? 0})`
  );
}

const args = new Set(process.argv.slice(2));
const resume = args.has("--resume");
const includePresets = args.has("--presets") || args.has("--all");
const onlyCore = args.has("--core") || !includePresets;

if (onlyCore || args.has("--all")) {
  for (const sc of CORE_SCENARIOS) {
    await recordScenario(sc, resume);
  }
}

if (includePresets) {
  for (const [specId, spec] of Object.entries(SPECIALTIES)) {
    for (const preset of spec.presets) {
      await recordScenario(
        {
          id: `PRESET-${specId}-${preset.id}`,
          specialty: specId,
          words: [
            { word: preset.p, role: "population" },
            { word: preset.i, role: "intervention" },
            { word: preset.c, role: "comparator" },
            { word: preset.o, role: "outcome" },
          ],
        },
        resume
      );
    }
  }
}
