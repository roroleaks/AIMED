import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SPECIALTIES } from "../../src/lib/specialties.ts";
import { assignPicoRoles, type PicoWord } from "../../src/lib/pico-roles.ts";
import { generateDeterministicScreen } from "../../src/lib/deterministic-screen.ts";
import { outcomeActionVerb } from "../../src/lib/outcome-polarity.ts";
import { scoreRecords, type ExploreRecord } from "../../src/lib/explore-scoring.ts";
import { composeManuscript } from "../../src/lib/manuscript-composer.ts";
import { classifyPaperType } from "../../src/lib/study-design.ts";
import { formatReferenceInStyle } from "../../src/lib/citation-styles.ts";
import { isNonEvidenceTitle, deduplicateArticles } from "../../src/lib/literature-sources.ts";
import type { AuditableRef } from "../../src/lib/relevance.ts";

function loadJson<T>(relPath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(relPath), "utf8")) as T;
}

interface LiteratureFixture {
  id: string;
  recordedAt: string;
  specialty: string;
  words: PicoWord[];
  screenResponse: ReturnType<typeof generateDeterministicScreen>;
  exploreResponse: {
    records: ExploreRecord[];
    corpusStats: { retrieved: number; screened: number; blocked: number; returned: number; relaxationLevel: number };
    searchLog?: Array<{ id: string; name?: string; query?: string; count?: number; ok?: boolean; date?: string }>;
  } | null;
}

test("SCI-01. Role fidelity: all 44 presets preserve P/I/C/O without placebo injection or duplicated words", () => {
  const allPresets = Object.values(SPECIALTIES).flatMap((s) =>
    s.presets.map((p) => ({ specialtyId: s.id, preset: p }))
  );
  assert.equal(allPresets.length, 44, "Expected 44 presets across 15 specialties");

  for (const { specialtyId, preset } of allPresets) {
    const structuredWords: PicoWord[] = [
      { word: preset.p, role: "population" },
      { word: preset.i, role: "intervention" },
      { word: preset.c, role: "comparator" },
      { word: preset.o, role: "outcome" },
    ];
    const screen = generateDeterministicScreen(structuredWords, []);
    for (const cat of ["established", "conflicting", "gap"] as const) {
      const phrase = screen.phrases[cat].phrase;
      assert.ok(phrase.includes(preset.p), `${specialtyId}/${preset.id}: missing P (${preset.p}) in ${cat}`);
      assert.ok(phrase.includes(preset.i), `${specialtyId}/${preset.id}: missing I (${preset.i}) in ${cat}`);
      assert.ok(phrase.includes(preset.c), `${specialtyId}/${preset.id}: missing C (${preset.c}) in ${cat}`);
      assert.ok(phrase.includes(preset.o), `${specialtyId}/${preset.id}: missing O (${preset.o}) in ${cat}`);
      assert.ok(
        !phrase.toLowerCase().includes("placebo or standard care"),
        `${specialtyId}/${preset.id}: unexpected "placebo or standard care" injected`
      );
      assert.ok(
        !/\b(\w+)\s+\1\b/i.test(phrase),
        `${specialtyId}/${preset.id}: duplicated adjacent word in "${phrase}"`
      );
    }

    const rawTokens = preset.raw.split(/[,;\n]/).map((w) => w.trim()).filter(Boolean);
    const assigned = assignPicoRoles(rawTokens);
    assert.equal(assigned.length, rawTokens.length, `${specialtyId}/${preset.id}: word count mismatch`);
  }
});

test("SCI-02. Role fidelity for ART-2 structured input keeps I=PGT-A and C=morphology-based blastocyst selection", () => {
  const art2 = loadJson<LiteratureFixture>("tests/fixtures/literature/ART-2.json");
  const phrase = art2.screenResponse.phrases.established.phrase;
  assert.ok(phrase.includes("PGT-A (I)"), `Expected PGT-A (I) in "${phrase}"`);
  assert.ok(
    phrase.includes("morphology-based blastocyst selection (C)"),
    `Expected morphology-based blastocyst selection (C) in "${phrase}"`
  );
});

test("SCI-03. Outcome polarity: harms use reduce, benefits use improve, never reduce quality of life", () => {
  for (const harm of ["preterm preeclampsia", "mortality", "miscarriage", "treatment failure", "adverse events"]) {
    assert.equal(outcomeActionVerb(harm), "reduce", `Expected reduce for harm "${harm}"`);
  }
  for (const benefit of ["live birth", "overall survival", "quality of life"]) {
    assert.equal(outcomeActionVerb(benefit), "improve", `Expected improve for benefit "${benefit}"`);
  }
  const qolScreen = generateDeterministicScreen([
    { word: "endometriosis", role: "population" },
    { word: "dienogest", role: "intervention" },
    { word: "placebo", role: "comparator" },
    { word: "quality of life", role: "outcome" },
  ]);
  assert.ok(!/reduce[^?]*quality[- ]of[- ]life/i.test(qolScreen.phrases.established.phrase));
});

test("SCI-04. Conclusion invariance across established, conflicting, and gap categories", () => {
  const onc1 = loadJson<LiteratureFixture>("tests/fixtures/literature/ONC-1.json");
  const records = onc1.exploreResponse?.records.slice(0, 5) ?? [];
  assert.ok(records.length > 0, "ONC-1 fixture must have records");

  const conclusions = (["established", "conflicting", "gap"] as const).map((cat) => {
    const m = composeManuscript({
      specialty: "oncology",
      words: onc1.words,
      category: cat,
      phrase: onc1.screenResponse.phrases[cat].phrase,
      screeningStats: { retrieved: 25, screened: 25, blocked: 0 },
      records,
      style: "vancouver",
    });
    const conclSec = m.sections.find((s) => /conclusion/i.test(s.heading));
    return conclSec?.paragraphs.join("\n") ?? "";
  });

  assert.equal(conclusions[0], conclusions[1]);
  assert.equal(conclusions[1], conclusions[2]);
});

test("SCI-05. Intervention required: ADV-HOMEO records score 0/ineligible and conclude Insufficient direct evidence", () => {
  const homeo = loadJson<LiteratureFixture>("tests/fixtures/literature/ADV-HOMEO.json");
  const placeboOnly: AuditableRef[] = [
    {
      pmid: "31000001",
      title: "Acupuncture versus placebo in IVF live birth rates: a randomized trial",
      authors: "Smith J",
      year: "2020",
      journal: "Hum Reprod",
      context: "Women undergoing IVF were randomized to acupuncture versus placebo. Live birth rate did not differ.",
    },
  ];
  const { scored } = scoreRecords(
    placeboOnly,
    homeo.screenResponse.phrases.gap.phrase,
    "gap"
  );
  assert.equal(scored.filter((r) => r.relevancePct > 0).length, 0, "Placebo-only IVF trial must score 0 for homeopathy");

  const estBasis = homeo.screenResponse.phrases.established.basis.toLowerCase();
  assert.ok(estBasis.startsWith("unavailable"), `Expected established unavailable, got: ${estBasis}`);

  const m = composeManuscript({
    specialty: "obgyn",
    words: homeo.words,
    category: "gap",
    phrase: homeo.screenResponse.phrases.gap.phrase,
    screeningStats: { retrieved: 25, screened: 25, blocked: 0 },
    records: [],
    style: "vancouver",
  });
  const concl = m.sections.find((s) => /conclusion/i.test(s.heading))?.paragraphs.join(" ") ?? "";
  assert.ok(/^(?:In conclusion,\s*)?Insufficient direct evidence/i.test(concl), `Expected Insufficient direct evidence, got: ${concl}`);
});

test("SCI-06. Positive control: genuine concordant RCT/SR fixture produces established support", () => {
  const onc1 = loadJson<LiteratureFixture>("tests/fixtures/literature/ONC-1.json");
  const records = onc1.exploreResponse?.records ?? [];
  assert.ok(records.length >= 3, "ONC-1 should have >= 3 records");
  const m = composeManuscript({
    specialty: "oncology",
    words: onc1.words,
    category: "established",
    phrase: onc1.screenResponse.phrases.established.phrase,
    screeningStats: { retrieved: 25, screened: 25, blocked: 0 },
    records: records.slice(0, 5),
    style: "vancouver",
  });
  const bodyText = m.sections.map((s) => s.paragraphs.join(" ")).join(" ");
  assert.ok(
    /consistent direct support|established|concordant/i.test(bodyText),
    "Positive control should reflect direct support"
  );
});

test("SCI-07. Direction check: single SR with no extractable direction reports direction not determinable", () => {
  const words: PicoWord[] = [
    { word: "endometriosis", role: "population" },
    { word: "dienogest", role: "intervention" },
    { word: "placebo", role: "comparator" },
    { word: "pelvic pain", role: "outcome" },
  ];
  const srNoDir: ExploreRecord[] = [
    {
      pmid: "32000001",
      title: "Dienogest versus placebo for endometriosis-associated pelvic pain: a systematic review",
      authors: "Lee K",
      year: "2022",
      journal: "Cochrane Database Syst Rev",
      pubType: "Systematic Review",
      context: "This systematic review evaluated dienogest compared with placebo for pelvic pain in women with endometriosis.",
      relevancePct: 88,
      matchedElements: ["P", "I", "C", "O"],
      source: "pubmed",
    },
  ];
  const screen = generateDeterministicScreen(words, srNoDir);
  assert.ok(/direction not determinable/i.test(screen.phrases.established.basis), `Expected "direction not determinable", got: ${screen.phrases.established.basis}`);
  assert.ok(!/\bconcordant\b/i.test(screen.phrases.established.basis), "Should not claim concordant when direction is not determinable");

  const m = composeManuscript({
    specialty: "obgyn",
    words,
    category: "established",
    phrase: "In endometriosis (P), does dienogest (I) compared with placebo (C) reduce pelvic pain (O)?",
    screeningStats: { retrieved: 1, screened: 1, blocked: 0, excluded: 0, relaxationLevel: 0 },
    records: srNoDir,
    style: "vancouver",
  });
  const text = m.sections.map((s) => s.paragraphs.join(" ")).join(" ");
  assert.ok(!/\bconcordant\b/i.test(text), "Manuscript should not claim concordant when direction is not determinable");
});

test("SCI-08. Zero-PICO paper: stroke RCT for IVF question scores 0", () => {
  const strokeRct: AuditableRef = {
    pmid: "33000001",
    title: "Endovascular thrombectomy versus medical therapy in acute ischemic stroke",
    authors: "Goyal M",
    year: "2021",
    journal: "NEJM",
    pubType: "Randomized Controlled Trial",
    context: "Patients with acute ischemic stroke were randomized to thrombectomy or standard care. Functional independence at 90 days improved.",
  };
  const { scored } = scoreRecords(
    [strokeRct],
    "In IVF patients (P), does artificial intelligence embryo selection (I) compared with embryologist morphological assessment (C) improve live birth (O)?",
    "established"
  );
  assert.equal(scored[0]?.relevancePct ?? 0, 0);
});

test("SCI-09. Non-evidence exclusion: NCT registration, protocol, job advert, erratum, conference abstract excluded", () => {
  const nct = loadJson<AuditableRef[]>("tests/fixtures/records/nct-registration.json");
  const proto = loadJson<AuditableRef[]>("tests/fixtures/records/protocol-paper.json");
  const job = loadJson<AuditableRef[]>("tests/fixtures/records/job-advert.json");
  const erratum: AuditableRef = {
    pmid: "39000001",
    title: "Erratum: Pembrolizumab in NSCLC",
    authors: "Editorial",
    year: "2024",
    journal: "NEJM",
    context: "Correction to Table 2.",
  };
  const conf: AuditableRef = {
    pmid: "39000002",
    title: "Abstract 104: Preliminary poster on pembrolizumab in NSCLC",
    authors: "Poster A",
    year: "2024",
    journal: "J Clin Oncol",
    pubType: "Meeting Abstract",
    context: "Conference abstract presented at ASCO.",
  };

  const phrase = "In advanced non-small cell lung cancer (P), does pembrolizumab (I) compared with platinum chemotherapy (C) improve overall survival (O)?";

  assert.equal(isNonEvidenceTitle(job[0].title), true);

  const { scored } = scoreRecords([...nct, ...proto, ...job, erratum, conf], phrase, "established");
  const kept = scored.filter((r) => r.relevancePct >= 30);
  assert.equal(kept.length, 0, `Non-evidence records must be excluded, got: ${kept.map((k) => k.title).join("; ")}`);
});

test("SCI-10. Landmark eligibility: KEYNOTE-024/042/189 for ONC-1 and STAR for ART-2", () => {
  const keynotes: AuditableRef[] = [
    {
      pmid: "27718847",
      title: "Pembrolizumab versus Chemotherapy for PD-L1-Positive Non-Small-Cell Lung Cancer (KEYNOTE-024)",
      authors: "Reck M, et al.",
      year: "2016",
      journal: "N Engl J Med",
      pubType: "Randomized Controlled Trial",
      context: "Patients with advanced non-small cell lung cancer were randomized to pembrolizumab or platinum chemotherapy. Overall survival was significantly longer with pembrolizumab.",
    },
    {
      pmid: "30955977",
      title: "Pembrolizumab versus chemotherapy for previously untreated, PD-L1-expressing, locally advanced or metastatic non-small-cell lung cancer (KEYNOTE-042)",
      authors: "Mok TSK, et al.",
      year: "2019",
      journal: "Lancet",
      pubType: "Randomized Controlled Trial",
      context: "In advanced non-small cell lung cancer, pembrolizumab improved overall survival compared with platinum-based chemotherapy.",
    },
    {
      pmid: "29658856",
      title: "Pembrolizumab plus Chemotherapy in Metastatic Non-Small-Cell Lung Cancer (KEYNOTE-189)",
      authors: "Gandhi L, et al.",
      year: "2018",
      journal: "N Engl J Med",
      pubType: "Randomized Controlled Trial",
      context: "Addition of pembrolizumab to platinum chemotherapy resulted in significantly longer overall survival in metastatic non-small cell lung cancer.",
    },
  ];
  const { scored: scoredOnc } = scoreRecords(
    keynotes,
    "In advanced non-small cell lung cancer (P), does pembrolizumab (I) compared with platinum chemotherapy (C) improve overall survival (O)?",
    "established"
  );
  assert.equal(scoredOnc.filter((r) => r.relevancePct >= 30).length, 3, "All 3 KEYNOTE trials must be eligible");

  const star: AuditableRef = {
    pmid: "31551155",
    title: "Preimplantation genetic testing for aneuploidy versus morphology as selection criteria for single frozen-thawed embryo transfer in good-prognosis patients: a multicenter randomized clinical trial (STAR)",
    authors: "Munne S, et al.",
    year: "2019",
    journal: "Fertil Steril",
    pubType: "Randomized Controlled Trial",
    context: "Women undergoing IVF were randomized to PGT-A or morphology-based blastocyst selection. Ongoing pregnancy and live birth rates did not differ overall.",
  };
  const { scored: scoredStar } = scoreRecords(
    [star],
    "In women aged 35-40 undergoing IVF (P), does PGT-A (I) compared with morphology-based blastocyst selection (C) improve cumulative live birth rate (O)?",
    "established"
  );
  assert.ok((scoredStar[0]?.relevancePct ?? 0) >= 30, "STAR trial (31551155) must be eligible");
});

test("SCI-11. Off-topic exclusion: ART-3 excludes sleep apnoea/CVD, post-MI aneurysm, and AF burden", () => {
  const art3 = loadJson<LiteratureFixture>("tests/fixtures/literature/ART-3.json");
  const offTopic: AuditableRef[] = [
    {
      pmid: "39111001",
      title: "Sleep apnoea and cardiovascular disease outcomes",
      authors: "Test A",
      year: "2023",
      journal: "Eur Heart J",
      context: "Obstructive sleep apnoea and cardiovascular mortality.",
    },
    {
      pmid: "39111002",
      title: "Left ventricular aneurysm after myocardial infarction",
      authors: "Test B",
      year: "2022",
      journal: "Circulation",
      context: "Post-MI ventricular aneurysm surgical repair.",
    },
    {
      pmid: "39111003",
      title: "Atrial fibrillation burden and stroke risk",
      authors: "Test C",
      year: "2023",
      journal: "JACC",
      context: "Catheter ablation reduces AF burden.",
    },
  ];
  const { scored } = scoreRecords(offTopic, art3.screenResponse.phrases.established.phrase, "established");
  assert.equal(scored.filter((r) => r.relevancePct >= 30).length, 0);
});

test("SCI-12. Finding extraction avoids methods boilerplate fragments", () => {
  const onc1 = loadJson<LiteratureFixture>("tests/fixtures/literature/ONC-1.json");
  const m = composeManuscript({
    specialty: "oncology",
    words: onc1.words,
    category: "established",
    phrase: onc1.screenResponse.phrases.established.phrase,
    screeningStats: { retrieved: 25, screened: 25, blocked: 0 },
    records: onc1.exploreResponse?.records.slice(0, 5) ?? [],
    style: "vancouver",
  });
  const text = [
    ...m.sections.flatMap((s) => s.paragraphs),
    ...(m.extractionTable?.rows.flat() ?? []),
  ].join(" ");
  assert.ok(!/Allocation concealment was achieved/i.test(text));
  assert.ok(!/Eleven studies reporting/i.test(text));
  assert.ok(!/Women were grouped by/i.test(text));
});

test("SCI-13. Study design classification respects PubMed publicationTypes", () => {
  assert.equal(classifyPaperType({ title: "Aspirin in pregnancy", pubType: "Review" }), "Review");
  assert.equal(classifyPaperType({ title: "ACOG Practice Bulletin", pubType: "Practice Guideline" }), "Practice Guideline");
  assert.equal(classifyPaperType({ title: "STAR trial", pubType: "Randomized Controlled Trial" }), "Randomized Controlled Trial (RCT)");
  assert.notEqual(
    classifyPaperType({ title: "Retrospective registry analysis of IVF cycles", pubType: "Observational Study" }),
    "In Vitro Study"
  );
});

test("SCI-14. No template prose shared between unrelated topics and banned phrases absent", () => {
  const onc1 = loadJson<LiteratureFixture>("tests/fixtures/literature/ONC-1.json");
  const ob1 = loadJson<LiteratureFixture>("tests/fixtures/literature/OB-1.json");

  const m1 = composeManuscript({
    specialty: "oncology",
    words: onc1.words,
    category: "established",
    phrase: onc1.screenResponse.phrases.established.phrase,
    screeningStats: { retrieved: 25, screened: 25, blocked: 0, excluded: 5, relaxationLevel: 0 },
    records: onc1.exploreResponse?.records.slice(0, 5) ?? [],
    style: "vancouver",
  });
  const m2 = composeManuscript({
    specialty: "obgyn",
    words: ob1.words,
    category: "established",
    phrase: ob1.screenResponse.phrases.established.phrase,
    screeningStats: { retrieved: 23, screened: 21, blocked: 2, excluded: 3, relaxationLevel: 1 },
    records: ob1.exploreResponse?.records.slice(0, 5) ?? [],
    style: "vancouver",
  });

  const p1 = new Set(
    m1.sections
      .flatMap((s) => s.paragraphs)
      .filter((p) => p.split(/\s+/).length > 20 && !/draft|educational|verify/i.test(p))
  );
  for (const para of m2.sections.flatMap((s) => s.paragraphs)) {
    if (para.split(/\s+/).length > 20 && !/draft|educational|verify/i.test(para)) {
      assert.ok(!p1.has(para), `Shared >20-word paragraph across unrelated topics: "${para.slice(0, 80)}..."`);
    }
  }

  for (const m of [m1, m2]) {
    const all = m.sections.flatMap((s) => s.paragraphs).join(" ");
    for (const banned of [
      "moderate to low",
      "Clinical concordance across studies",
      "Standardized Dosing & Timing",
      "Zero-hallucination",
    ]) {
      assert.ok(!all.includes(banned), `Banned phrase found: ${banned}`);
    }
  }
});

test("SCI-15. Methods truthfulness: lists only ok=true sources, query strings, hit counts, and date", () => {
  const onc1 = loadJson<LiteratureFixture>("tests/fixtures/literature/ONC-1.json");
  const searchLog = [
    { id: "pubmed", name: "PubMed", query: "nsclc pembrolizumab", count: 15, ok: true, date: "2026-11-26" },
    { id: "europepmc", name: "Europe PMC", query: "nsclc pembrolizumab", count: 0, ok: false, error: "503", date: "2026-11-26" },
  ];
  const m = composeManuscript({
    specialty: "oncology",
    words: onc1.words,
    category: "established",
    phrase: onc1.screenResponse.phrases.established.phrase,
    screeningStats: { retrieved: 25, screened: 25, blocked: 0 },
    records: onc1.exploreResponse?.records.slice(0, 5) ?? [],
    style: "vancouver",
    searchLog,
  });
  const methods = m.sections.find((s) => /search|method/i.test(s.heading))?.paragraphs.join(" ") ?? "";
  assert.ok(methods.includes("PubMed"), "Methods should mention ok=true source PubMed");
  assert.ok(methods.includes("nsclc pembrolizumab"), "Methods should include query string");
  assert.ok(methods.includes("15"), "Methods should include hit count");
  assert.ok(methods.includes("2026-11-26"), "Methods should include date");
  assert.ok(
    !methods.includes("records were retained only when they addressed the population, the intervention or comparator, and the outcome"),
    "Methods must not include fabricated retention boilerplate"
  );
});

test("SCI-16. Citation formats: Vancouver, APA, Harvard without broken author tokens or HTML tags", () => {
  const ref1: AuditableRef = {
    pmid: "12345678",
    doi: "10.1001/jama.2020.0001",
    title: "Test study title",
    authors: "Newnham A, Smith B, et al.",
    year: "2020",
    journal: "JAMA",
  };
  const ref2: AuditableRef = {
    pmid: "87654321",
    doi: "10.1016/j.fertnstert.2021.0002",
    title: "Another study title",
    authors: "Braga DPAF, Setti AS",
    year: "2021",
    journal: "Fertil Steril",
  };

  const van = formatReferenceInStyle(ref1, "vancouver", 1);
  assert.ok(van.includes("Newnham A"), `Vancouver should include Newnham A: ${van}`);
  assert.ok(!van.includes("al E."), `Vancouver must never produce "al E.": ${van}`);
  assert.ok(!/<i>|<\/i>/i.test(van), `No HTML tags in Vancouver: ${van}`);

  const apa = formatReferenceInStyle(ref2, "apa", 1);
  assert.ok(apa.includes("Braga, D. P. A. F."), `APA should format Braga, D. P. A. F.: ${apa}`);
  assert.ok(!apa.includes("DPAF, B."), `APA must never produce "DPAF, B.": ${apa}`);
  assert.ok(!/PMID:\s*cr:/i.test(apa), `No PMID: cr: label: ${apa}`);

  const harv = formatReferenceInStyle(ref2, "harvard", 1);
  assert.ok(harv.includes("2021"), `Harvard should include year: ${harv}`);
  assert.ok(!/<i>|<\/i>/i.test(harv), `No HTML tags in Harvard: ${harv}`);
});

test("SCI-17. Deduplication collapses same DOI across CrossRef and Semantic Scholar", () => {
  const deduped = deduplicateArticles([
    {
      pmid: "",
      doi: "10.1056/NEJMoa1801005",
      title: "KEYNOTE-189",
      authors: "Gandhi L",
      year: "2018",
      journal: "NEJM",
      pubType: "Journal Article",
      context: "Abstract A",
      source: "crossref",
    },
    {
      pmid: "",
      doi: "https://doi.org/10.1056/nejmoa1801005",
      title: "KEYNOTE-189",
      authors: "Gandhi L",
      year: "2018",
      journal: "NEJM",
      pubType: "Journal Article",
      context: "Abstract A",
      source: "semanticscholar",
    },
  ]);
  assert.equal(deduped.length, 1);
});

test("SCI-18. Title has no '?:' and does not claim Established when conclusion is insufficient", () => {
  const homeo = loadJson<LiteratureFixture>("tests/fixtures/literature/ADV-HOMEO.json");
  const m = composeManuscript({
    specialty: "obgyn",
    words: homeo.words,
    category: "gap",
    phrase: homeo.screenResponse.phrases.gap.phrase,
    screeningStats: { retrieved: 25, screened: 25, blocked: 0 },
    records: [],
    style: "vancouver",
  });
  assert.ok(!m.title.includes("?:"), `Title must not contain '?:': ${m.title}`);
  assert.ok(!/established/i.test(m.title), `Insufficient evidence title must not say Established: ${m.title}`);
});

test("SCI-19. No author-note placeholders in final manuscript text", () => {
  const onc1 = loadJson<LiteratureFixture>("tests/fixtures/literature/ONC-1.json");
  const m = composeManuscript({
    specialty: "oncology",
    words: onc1.words,
    category: "established",
    phrase: onc1.screenResponse.phrases.established.phrase,
    screeningStats: { retrieved: 25, screened: 25, blocked: 0 },
    records: onc1.exploreResponse?.records.slice(0, 5) ?? [],
    style: "vancouver",
  });
  const full = [m.title, ...m.abstract, ...m.sections.flatMap((s) => s.paragraphs), ...m.references].join(" ");
  assert.ok(!/\[Author note:/i.test(full), "No [Author note: ...] placeholders allowed");
});
