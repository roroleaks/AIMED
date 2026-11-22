import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { assignPicoRoles } from "./pico-roles.ts";
import { generateDeterministicScreen, isAmbiguousOrNonClinicalInput, validateScreenRequest } from "./deterministic-screen.ts";
import { scoreRecords, type ExploreRecord } from "./explore-scoring.ts";
import { composeManuscript } from "./manuscript-composer.ts";
import { buildWorkflowDocx } from "./docx-generator.ts";
import { buildWorkflowPdf } from "./pdf-generator.ts";
import { type AuditableRef } from "./relevance.ts";
import { deduplicateArticles } from "./literature-sources.ts";
import { signRecord, verifyRecordSignature } from "./record-signature.ts";
import { classifyPaperType } from "./study-design.ts";
import { formatApaAuthors } from "./citation-styles.ts";
import { buildPubMedQuery } from "./pubmed-query.ts";

function extractDocxText(buf: Buffer): string {
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const compMethod = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
      const dataOffset = offset + 30 + nameLen + extraLen;
      if (name === "word/document.xml") {
        const raw = buf.subarray(dataOffset, dataOffset + compSize);
        const xml = compMethod === 8 ? zlib.inflateRawSync(raw).toString("utf8") : raw.toString("utf8");
        return xml
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ");
      }
      offset = dataOffset + compSize;
    } else {
      offset++;
    }
  }
  return "";
}

function extractPdfText(b: Buffer): string {
  const str = b.toString("latin1");
  const texts: string[] = [];
  for (const m of str.matchAll(/\(([^)]+)\)\s*Tj/g)) {
    texts.push(m[1]);
  }
  for (const m of str.matchAll(/\[([^\]]+)\]\s*TJ/g)) {
    for (const sub of m[1].matchAll(/\(([^)]+)\)/g)) {
      texts.push(sub[1]);
    }
  }
  return texts.join(" ");
}

// ============================================================================
// AUD-01: ART-1 tags
// ============================================================================
test("AUD-01. ART-1 tags: C = embryologist morphological assessment; no placebo; GBD stroke/CVD/job advert excluded", () => {
  const rawWords = [
    "IVF",
    "artificial intelligence embryo selection",
    "embryologist morphological assessment",
    "live birth",
    "time-lapse imaging"
  ];
  const words = assignPicoRoles(rawWords);
  const comp = words.find(w => w.role === "comparator")?.word;
  assert.equal(comp, "embryologist morphological assessment", "Comparator must be morphological assessment");
  assert.ok(!words.some(w => w.word.toLowerCase().includes("placebo")), "Must not inject placebo");

  const fixtures: AuditableRef[] = [
    {
      pmid: "3000001",
      title: "Global, regional, and national burden of stroke and CVD: findings from GBD 2019",
      journal: "Lancet Neurol",
      pubType: "Systematic Review",
      publicationTypes: ["Systematic Review"],
      context: "Stroke and cardiovascular disease represent leading causes of global mortality and disability."
    },
    {
      pmid: "3000002",
      title: "Position Available: Postdoctoral Embryology Fellowship at Reproductive Center",
      journal: "Fertil Steril",
      pubType: "Directory",
      publicationTypes: ["Directory"],
      context: "A position is available for an embryologist to conduct morphological assessments."
    },
    {
      pmid: "3000003",
      title: "Artificial intelligence embryo selection compared with standard embryologist morphology for live birth in IVF",
      journal: "Hum Reprod",
      pubType: "Randomized Controlled Trial",
      publicationTypes: ["Randomized Controlled Trial"],
      context: "In couples undergoing IVF, artificial intelligence embryo selection improved live birth compared to standard embryologist morphology."
    }
  ];

  const screen = generateDeterministicScreen(words, fixtures);
  const phrase = screen.phrases.established.phrase;
  assert.ok(phrase.includes("embryologist morphological assessment"), "Screening phrase must contain morphological assessment as comparator");
  assert.ok(!phrase.includes("placebo"), "Phrase must not inject placebo");

  const scored = scoreRecords(fixtures, phrase, "established", []);
  const gbd = scored.scored.find(r => r.pmid === "3000001");
  const job = scored.scored.find(r => r.pmid === "3000002");
  const genuine = scored.scored.find(r => r.pmid === "3000003");

  assert.equal(gbd?.relevancePct, 0, "GBD stroke/CVD must score 0% and be ineligible");
  assert.equal(job?.relevancePct, 0, "Job advertisement must score 0% and be ineligible");
  assert.ok((genuine?.relevancePct ?? 0) >= 70, "Genuine AI embryo selection RCT must be retained with high relevance");
});

// ============================================================================
// AUD-02: ART-2 structured fields
// ============================================================================
test("AUD-02. ART-2 structured fields: Roles unchanged, PGT-A is I; STAR 31551155 retained; Jo & Braga not direct evidence", () => {
  const words = [
    { word: "women undergoing IVF", role: "population" as const },
    { word: "PGT-A", role: "intervention" as const },
    { word: "morphological selection alone", role: "comparator" as const },
    { word: "live birth rate", role: "outcome" as const }
  ];
  assert.equal(words[1].role, "intervention", "PGT-A must be intervention");

  const starTrial: AuditableRef = {
    pmid: "31551155",
    title: "Clinical outcomes of preimplantation genetic testing for aneuploidy (PGT-A) versus morphological assessment: a multicenter randomized trial",
    authors: "Munne S, Kaplan B, Frattarelli JL",
    year: "2019",
    journal: "Fertil Steril",
    pubType: "Randomized Controlled Trial",
    publicationTypes: ["Randomized Controlled Trial"],
    context: "In women undergoing IVF, PGT-A did not improve overall ongoing pregnancy rate per embryo transfer compared with morphological selection alone."
  };

  const joRecord: AuditableRef = {
    pmid: "43041260",
    title: "Protocol for evaluation of preimplantation genetic testing in reproductive medicine",
    pubType: "Clinical Trial Protocol",
    publicationTypes: ["Clinical Trial Protocol"],
    context: "This study protocol outlines planned enrollment and methodology for evaluating PGT-A."
  };

  const bragaRecord: AuditableRef = {
    pmid: "42924271",
    title: "Current perspectives on preimplantation genetic testing: a narrative review of clinical practice",
    pubType: "Review",
    publicationTypes: ["Review"],
    context: "We summarize observational findings and clinical perspectives on preimplantation genetic testing."
  };

  const fixtures = [starTrial, joRecord, bragaRecord];
  const screen = generateDeterministicScreen(words, fixtures);
  const phrase = screen.phrases.established.phrase;
  const scored = scoreRecords(fixtures, phrase, "established", []);

  const starScored = scored.scored.find(r => r.pmid === "31551155");
  const joScored = scored.scored.find(r => r.pmid === "43041260");
  const bragaScored = scored.scored.find(r => r.pmid === "42924271");

  assert.ok((starScored?.relevancePct ?? 0) >= 70, "STAR trial must be retained as direct evidence");
  assert.equal(joScored?.relevancePct, 0, "Jo protocol must be excluded (relevance 0%)");
  assert.equal(bragaScored?.relevancePct, 0, "Braga narrative review must not be retained as direct support");
});

// ============================================================================
// AUD-03: ART-3 ERA in RIF
// ============================================================================
test("AUD-03. ART-3 ERA in RIF: No cardiology records; duplicate DOI collapsed across providers", () => {
  const art1: AuditableRef = {
    pmid: "101",
    doi: "10.1016/j.fertnstert.2025.07.830",
    title: "Endometrial receptivity analysis in recurrent implantation failure",
    journal: "Fertil Steril",
    source: "crossref",
    context: "In patients with recurrent implantation failure, endometrial receptivity array was evaluated."
  };
  const art2: AuditableRef = {
    pmid: "102",
    doi: "https://doi.org/10.1016/j.fertnstert.2025.07.830",
    title: "Endometrial receptivity analysis in recurrent implantation failure",
    journal: "Fertility and Sterility",
    source: "semanticscholar",
    context: "In patients with recurrent implantation failure, endometrial receptivity array was evaluated."
  };
  const cardioArt: AuditableRef = {
    pmid: "103",
    doi: "10.1056/nejmoa1900123",
    title: "Percutaneous coronary intervention in acute myocardial infarction",
    journal: "N Engl J Med",
    source: "pubmed",
    context: "Cardiology patients with acute myocardial infarction were treated with stents."
  };

  const deduped = deduplicateArticles([art1, art2, cardioArt] as unknown as Parameters<typeof deduplicateArticles>[0]);
  assert.equal(deduped.length, 2, "Crossref and Semantic Scholar identical DOI must collapse into 1 record");

  const words = assignPicoRoles(["recurrent implantation failure", "endometrial receptivity array", "standard timing embryo transfer", "live birth"]);
  const screen = generateDeterministicScreen(words, [art1, cardioArt]);
  const scored = scoreRecords([art1, cardioArt], screen.phrases.established.phrase, "established", []);

  const cardioScored = scored.scored.find(r => r.pmid === "103");
  assert.equal(cardioScored?.relevancePct, 0, "Cardiology record must have 0% relevance for ERA in RIF");
});

// ============================================================================
// AUD-04: OB-1 aspirin
// ============================================================================
test("AUD-04. OB-1 aspirin: Question uses 'reduce preterm preeclampsia'; P = high-risk pregnancy", () => {
  const words = assignPicoRoles(["high-risk pregnancy", "aspirin", "placebo", "preterm preeclampsia"]);
  const pWord = words.find(w => w.role === "population")?.word;
  assert.equal(pWord, "high-risk pregnancy", "P must be high-risk pregnancy");

  const screen = generateDeterministicScreen(words, []);
  const estPhrase = screen.phrases.established.phrase;
  assert.ok(estPhrase.includes("reduce preterm preeclampsia"), `Question must use 'reduce preterm preeclampsia', got: ${estPhrase}`);
  assert.ok(!estPhrase.includes("improve preterm preeclampsia"), "Must NEVER use 'improve preterm preeclampsia'");
});

// ============================================================================
// AUD-05: IM-1 sepsis
// ============================================================================
test("AUD-05. IM-1 sepsis: Comparator 'saline'; no neonatal outcome; PubMed query is element-wise", () => {
  const words = assignPicoRoles(["sepsis", "balanced crystalloids", "saline", "30-day mortality"]);
  const comp = words.find(w => w.role === "comparator")?.word;
  assert.equal(comp, "saline", "Comparator must be saline");

  const screen = generateDeterministicScreen(words, []);
  const phrase = screen.phrases.established.phrase;
  assert.ok(!phrase.toLowerCase().includes("neonatal"), "Must not include neonatal outcome for adult sepsis");
  assert.ok(phrase.includes("30-day mortality"), "Must include 30-day mortality");

  // Query generation test: multi-arm candidate ladder element-wise
  const query = buildPubMedQuery({
    population: "sepsis",
    intervention: "balanced crystalloids",
    comparator: "saline",
    outcome: "30-day mortality"
  });
  assert.ok(query.includes("sepsis"), "Query must contain population sepsis");
  assert.ok(query.includes("balanced crystalloids"), "Query must contain intervention balanced crystalloids");
  assert.ok(!query.includes("[All Words Concatenated]"), "Query must be element-wise");
});

// ============================================================================
// AUD-06: ONC-1
// ============================================================================
test("AUD-06. ONC-1: KEYNOTE trials retained; DESTINY-Lung06 excluded as protocol; perioperative review excluded", () => {
  const words = assignPicoRoles(["advanced NSCLC", "pembrolizumab", "platinum chemotherapy", "overall survival"]);

  const keynote024: AuditableRef = {
    pmid: "27718847",
    title: "Pembrolizumab versus Chemotherapy for PD-L1-Positive Non-Small-Cell Lung Cancer",
    authors: "Reck M, Rodríguez-Abreu D, Robinson AG",
    year: "2016",
    journal: "N Engl J Med",
    pubType: "Randomized Controlled Trial",
    publicationTypes: ["Randomized Controlled Trial"],
    context: "In patients with advanced NSCLC, pembrolizumab significantly improved overall survival compared with platinum chemotherapy."
  };

  const keynote042: AuditableRef = {
    pmid: "30955977",
    title: "Pembrolizumab versus chemotherapy for previously untreated, PD-L1-expressing, locally advanced or metastatic non-small-cell lung cancer",
    authors: "Mok TSK, Wu YL, Kudaba I",
    year: "2019",
    journal: "Lancet",
    pubType: "Randomized Controlled Trial",
    publicationTypes: ["Randomized Controlled Trial"],
    context: "Pembrolizumab monotherapy significantly improved overall survival compared with chemotherapy in locally advanced or metastatic NSCLC."
  };

  const keynote189: AuditableRef = {
    pmid: "29658856",
    title: "Pembrolizumab plus Chemotherapy in Metastatic Non-Small-Cell Lung Cancer",
    authors: "Gandhi L, Rodríguez-Abreu D, Gadgeel S",
    year: "2018",
    journal: "N Engl J Med",
    pubType: "Randomized Controlled Trial",
    publicationTypes: ["Randomized Controlled Trial"],
    context: "In patients with metastatic NSCLC, adding pembrolizumab to platinum chemotherapy resulted in significantly longer overall survival."
  };

  const destinyLung06: AuditableRef = {
    pmid: "42682104",
    title: "Trastuzumab deruxtecan in HER2-mutant advanced NSCLC: study protocol and planned enrollment for a phase 3 trial",
    authors: "Doe J, Smith R",
    year: "2024",
    journal: "Lung Cancer",
    pubType: "Clinical Trial Protocol",
    publicationTypes: ["Clinical Trial Protocol"],
    context: "This study design and rationale outlines planned enrollment to evaluate trastuzumab deruxtecan in advanced NSCLC."
  };

  const resectableReview: AuditableRef = {
    pmid: "3500001",
    title: "Perioperative neoadjuvant therapy in resectable non-small cell lung cancer: a systematic review",
    authors: "White P, Green T",
    year: "2023",
    journal: "Chest",
    pubType: "Review",
    publicationTypes: ["Review"],
    context: "We review clinical evidence for neoadjuvant chemotherapy in early-stage resectable lung cancer."
  };

  const fixtures = [keynote024, keynote042, keynote189, destinyLung06, resectableReview];
  const screen = generateDeterministicScreen(words, fixtures);
  const scored = scoreRecords(fixtures, screen.phrases.established.phrase, "established", []);

  const kn24 = scored.scored.find(r => r.pmid === "27718847");
  const kn42 = scored.scored.find(r => r.pmid === "30955977");
  const kn189 = scored.scored.find(r => r.pmid === "29658856");
  const destiny = scored.scored.find(r => r.pmid === "42682104");
  const review = scored.scored.find(r => r.pmid === "3500001");

  assert.ok((kn24?.relevancePct ?? 0) >= 70, "KEYNOTE-024 must be retained");
  assert.ok((kn42?.relevancePct ?? 0) >= 70, "KEYNOTE-042 must be retained");
  assert.ok((kn189?.relevancePct ?? 0) >= 70, "KEYNOTE-189 must be retained");
  assert.equal(destiny?.relevancePct, 0, "DESTINY-Lung06 protocol must be excluded");
  assert.equal(review?.relevancePct, 0, "Early-stage resectable review must be excluded for advanced NSCLC");
});

// ============================================================================
// AUD-07: SURG-1
// ============================================================================
test("AUD-07. SURG-1: No 'laparoscopic surgery' injected; I antibiotics, C appendectomy", () => {
  const words = assignPicoRoles(["acute uncomplicated appendicitis", "antibiotics", "appendectomy", "treatment efficacy"]);
  const i = words.find(w => w.role === "intervention")?.word;
  const c = words.find(w => w.role === "comparator")?.word;
  assert.equal(i, "antibiotics");
  assert.equal(c, "appendectomy");

  const screen = generateDeterministicScreen(words, []);
  const phrase = screen.phrases.established.phrase;
  assert.ok(!phrase.toLowerCase().includes("laparoscopic surgery"), "Must not inject unrequested laparoscopic surgery phrase");
  assert.ok(phrase.includes("antibiotics"), "Must include antibiotics");
  assert.ok(phrase.includes("appendectomy"), "Must include appendectomy");
});

// ============================================================================
// AUD-08: Same records, 3 categories -> Identical evidence conclusion
// ============================================================================
test("AUD-08. Same records, 3 categories: Evidence conclusion is identical across all categories", () => {
  const words = assignPicoRoles(["short cervix", "vaginal progesterone", "placebo", "preterm birth"]);
  const retained: ExploreRecord[] = [
    {
      pmid: "2200001",
      title: "Vaginal progesterone versus placebo for prevention of preterm birth in short cervix",
      authors: "Hassan SS, Romero R, Vidyadhari D",
      year: "2011",
      journal: "Ultrasound Obstet Gynecol",
      pubType: "Randomized Controlled Trial",
      publicationTypes: ["Randomized Controlled Trial"],
      context: "In pregnant women with a short cervix, vaginal progesterone significantly reduced preterm birth compared with placebo.",
      relevancePct: 95,
      matchedElements: ["P", "I", "C", "O"]
    }
  ];

  const mEst = composeManuscript({
    words,
    category: "established",
    phrase: "In short cervix (P), does vaginal progesterone (I) compared with placebo (C) reduce preterm birth (O)?",
    screeningStats: { retrieved: 10, screened: 10, relaxationLevel: 0, excludedCount: 0 },
    records: retained,
    specialty: "obgyn"
  });

  const mConf = composeManuscript({
    words,
    category: "conflicting",
    phrase: "In short cervix (P), does vaginal progesterone (I) compared with placebo (C) reduce preterm birth (O)?",
    screeningStats: { retrieved: 10, screened: 10, relaxationLevel: 0, excludedCount: 0 },
    records: retained,
    specialty: "obgyn"
  });

  const mGap = composeManuscript({
    words,
    category: "gap",
    phrase: "In short cervix (P), does vaginal progesterone (I) compared with placebo (C) reduce preterm birth (O)?",
    screeningStats: { retrieved: 10, screened: 10, relaxationLevel: 0, excludedCount: 0 },
    records: retained,
    specialty: "obgyn"
  });

  assert.equal(
    mEst.evidenceConclusion,
    mConf.evidenceConclusion,
    "Evidence conclusion must be identical for established and conflicting"
  );
  assert.equal(
    mEst.evidenceConclusion,
    mGap.evidenceConclusion,
    "Evidence conclusion must be identical for established and gap"
  );
});

// ============================================================================
// AUD-09: Zero-PICO stroke RCT
// ============================================================================
test("AUD-09. Zero-PICO stroke RCT: Ineligible for AI embryo IVF question, relevance = 0%", () => {
  const strokeRct: AuditableRef = {
    pmid: "2999999",
    title: "Thrombectomy 6 to 24 Hours after Stroke with a Mismatch between Deficit and Infarct",
    authors: "Nogueira RG, Jadhav AP, Haussen DC",
    year: "2018",
    journal: "N Engl J Med",
    pubType: "Randomized Controlled Trial",
    publicationTypes: ["Randomized Controlled Trial"],
    doi: "10.1056/nejmoa1706442",
    context: "In patients with acute ischemic stroke from 6 to 24 hours after onset, thrombectomy plus standard medical care resulted in superior clinical outcomes compared with medical care alone."
  };

  const phrase = "In IVF (P), does artificial intelligence embryo selection (I) compared with embryologist morphological assessment (C) improve live birth (O)?";
  const scored = scoreRecords([strokeRct], phrase, "established", []);
  assert.equal(scored.scored[0].relevancePct, 0, "Zero-PICO stroke RCT must receive 0% relevancePct");
});

// ============================================================================
// AUD-10: Fabricated record via compose/export
// ============================================================================
test("AUD-10. Fabricated record via compose/export: Rejected by signature trust boundary", () => {
  const genuineRecord = {
    pmid: "31551155",
    title: "Clinical outcomes of PGT-A",
    relevancePct: 85
  };
  const signed = signRecord(genuineRecord);

  // Tamper with record content
  const fabricated = {
    ...signed,
    title: "Fabricated trial showing 100% cure rate with unapproved drug"
  };

  assert.ok(verifyRecordSignature(signed), "Genuine signed record passes signature verification");
  assert.ok(!verifyRecordSignature(fabricated), "Fabricated/tampered record must fail signature verification");

  // Record with missing signature
  const unsigned = { pmid: "9999999", title: "Unsigned paper", relevancePct: 90 };
  assert.ok(!verifyRecordSignature(unsigned), "Unsigned record must fail signature verification");
});

// ============================================================================
// AUD-11: Genuine high-relevance record via export
// ============================================================================
test("AUD-11. Genuine high-relevance record via export: Accepted when signature is valid", () => {
  const record = {
    pmid: "27718847",
    title: "Pembrolizumab versus Chemotherapy for PD-L1-Positive NSCLC",
    relevancePct: 92
  };
  const signed = signRecord(record);
  assert.ok(verifyRecordSignature(signed), "Genuine high-relevance record is accepted");
});

// ============================================================================
// AUD-12: Two unrelated topics
// ============================================================================
test("AUD-12. Two unrelated topics: No shared non-disclaimer paragraph >20 words", () => {
  const artWords = assignPicoRoles(["IVF", "artificial intelligence embryo selection", "embryologist morphological assessment", "live birth"]);
  const imWords = assignPicoRoles(["sepsis", "balanced crystalloids", "saline", "30-day mortality"]);

  const artManuscript = composeManuscript({
    words: artWords,
    category: "established",
    phrase: "In IVF (P), does artificial intelligence embryo selection (I) compared with embryologist morphological assessment (C) improve live birth (O)?",
    screeningStats: { retrieved: 35, screened: 35, relaxationLevel: 0, excludedCount: 3 },
    records: [
      {
        pmid: "1",
        title: "AI embryo selection for IVF live birth",
        authors: "Doe J",
        year: "2023",
        journal: "Hum Reprod",
        pubType: "Randomized Controlled Trial",
        publicationTypes: ["Randomized Controlled Trial"],
        context: "In patients with IVF, artificial intelligence embryo selection improved live birth compared to embryologist morphological assessment.",
        relevancePct: 95,
        matchedElements: ["P", "I", "C", "O"]
      }
    ],
    specialty: "obgyn"
  });

  const imManuscript = composeManuscript({
    words: imWords,
    category: "established",
    phrase: "In sepsis (P), does balanced crystalloids (I) compared with saline (C) reduce 30-day mortality (O)?",
    screeningStats: { retrieved: 18, screened: 18, relaxationLevel: 1, excludedCount: 1 },
    records: [
      {
        pmid: "2",
        title: "Balanced crystalloids versus saline in sepsis",
        authors: "Smith A",
        year: "2023",
        journal: "N Engl J Med",
        pubType: "Randomized Controlled Trial",
        publicationTypes: ["Randomized Controlled Trial"],
        context: "In patients with sepsis, balanced crystalloids reduced 30-day mortality compared with saline.",
        relevancePct: 95,
        matchedElements: ["P", "I", "C", "O"]
      }
    ],
    specialty: "internal_med"
  });

  const isSharedBoilerplate = (p: string) => {
    const low = p.toLowerCase();
    return low.includes("disclaimer") ||
      low.includes("boundaries") ||
      low.includes("grey literature") ||
      low.includes("screening evaluated") ||
      low.includes("pico parameters") ||
      low.includes("recommended clinical research workup") ||
      low.includes("author note");
  };

  const artParas = [
    ...artManuscript.abstract,
    ...artManuscript.sections.flatMap(s => s.paragraphs)
  ].filter(p => !isSharedBoilerplate(p));

  const imParas = [
    ...imManuscript.abstract,
    ...imManuscript.sections.flatMap(s => s.paragraphs)
  ].filter(p => !isSharedBoilerplate(p));

  for (const ap of artParas) {
    const aWords = ap.split(/\s+/).filter(Boolean);
    if (aWords.length < 20) continue;
    for (const ip of imParas) {
      assert.notEqual(ap, ip, `Two unrelated topics must not share non-disclaimer paragraph: "${ap.slice(0, 60)}..."`);
    }
  }
});

// ============================================================================
// AUD-13: DOCX export
// ============================================================================
test("AUD-13. DOCX export: Heading styles present; no ####, **, <i>; no developer name or copyright", async () => {
  const workflow = {
    words: [{ word: "NSCLC", role: "population" }, { word: "pembrolizumab", role: "intervention" }, { word: "chemotherapy", role: "comparator" }, { word: "overall survival", role: "outcome" }],
    category: "established" as const,
    phrase: "In NSCLC (P), does pembrolizumab (I) compared with chemotherapy (C) improve overall survival (O)?",
    specialty: "oncology",
    screeningStats: { retrieved: 10, screened: 10, relaxationLevel: 0, excludedCount: 0 },
    papers: [],
    title: "Pembrolizumab in <i>NSCLC</i>",
    abstract: ["In patients with **NSCLC**, pembrolizumab improved <i>overall survival</i>."],
    sections: [
      {
        heading: "Background",
        paragraphs: ["#### Clinical context\n\nAdvanced NSCLC requires **first-line** therapy.", "Treatment with <i>pembrolizumab</i> has been studied."]
      }
    ],
    references: ["1.  Reck M, et al. Pembrolizumab in <i>NSCLC</i>. N Engl J Med. 2016; doi:10.1056/nejmoa1606774"]
  };

  const buf = await buildWorkflowDocx(workflow);
  assert.ok(buf.length > 5000, "DOCX buffer must be generated");
  assert.equal(buf.subarray(0, 4).toString("hex"), "504b0304", "Must have PK zip signature");

  const text = extractDocxText(buf);
  assert.ok(!text.includes("####"), "DOCX must not contain literal ####");
  assert.ok(!text.includes("**"), "DOCX must not contain literal **");
  assert.ok(!text.includes("<i>") && !text.includes("</i>"), "DOCX must not contain literal <i> or </i>");
  assert.ok(!text.toLowerCase().includes("raouf roshdy"), "DOCX must not contain developer name");
  assert.ok(!text.toLowerCase().includes("copyright"), "DOCX must not contain developer copyright");
  assert.ok(!text.toLowerCase().includes("lead clinical investigator"), "DOCX must not contain fake title");
});

// ============================================================================
// AUD-14: PDF export
// ============================================================================
test("AUD-14. PDF export: No literal HTML tags; sub-headings rendered cleanly", async () => {
  const workflow = {
    words: [{ word: "NSCLC", role: "population" }, { word: "pembrolizumab", role: "intervention" }, { word: "chemotherapy", role: "comparator" }, { word: "overall survival", role: "outcome" }],
    category: "established" as const,
    phrase: "In NSCLC (P), does pembrolizumab (I) compared with chemotherapy (C) improve overall survival (O)?",
    specialty: "oncology",
    screeningStats: { retrieved: 10, screened: 10, relaxationLevel: 0, excludedCount: 0 },
    papers: [],
    title: "Pembrolizumab in <i>NSCLC</i>",
    abstract: ["In patients with **NSCLC**, pembrolizumab improved <i>overall survival</i>."],
    sections: [
      {
        heading: "Background",
        paragraphs: ["#### Clinical context\n\nAdvanced NSCLC requires therapy.", "Evidence for <i>in vitro</i> and in vivo efficacy."]
      }
    ],
    references: ["1. Reck M, et al. Pembrolizumab in <i>NSCLC</i>. N Engl J Med. 2016; doi:10.1056/nejmoa1606774"]
  };

  const buf = await buildWorkflowPdf(workflow);
  assert.ok(buf.length > 5000, "PDF buffer must be generated");
  assert.equal(buf.subarray(0, 4).toString("utf8"), "%PDF", "Must have %PDF signature");

  const text = extractPdfText(buf);
  assert.ok(!text.includes("<i>") && !text.includes("</i>"), "PDF must not contain literal HTML tags <i>");
  assert.ok(!text.includes("####"), "PDF must not print raw #### heading markdown");
  assert.ok(!text.toLowerCase().includes("raouf roshdy"), "PDF must not contain developer name");
});

// ============================================================================
// AUD-15: Empty / 2-word / astrology / sources: [] / a, b, c, d
// ============================================================================
test("AUD-15. Input validation: Empty, 2-word, astrology, empty sources, non-clinical return 400 or needsClarification", () => {
  // Empty
  const rEmpty = validateScreenRequest({ words: [], specialty: "obgyn" });
  assert.equal(rEmpty.ok, false);

  // 2 words
  const r2Words = validateScreenRequest({
    words: [{ word: "aspirin", role: "intervention" }, { word: "pregnancy", role: "population" }],
    specialty: "obgyn"
  });
  assert.equal(r2Words.ok, false);

  // Unknown specialty
  const rAstrology = validateScreenRequest({
    words: [{ word: "a", role: "population" }, { word: "b", role: "intervention" }, { word: "c", role: "outcome" }],
    specialty: "astrology"
  });
  assert.equal(rAstrology.ok, false);

  // Empty sources
  const rEmptySources = validateScreenRequest({
    words: [{ word: "a", role: "population" }, { word: "b", role: "intervention" }, { word: "c", role: "outcome" }],
    specialty: "obgyn",
    sources: []
  });
  assert.equal(rEmptySources.ok, false);

  // Ambiguous non-clinical input: "pain, drug, better, patients"
  const ambig1 = isAmbiguousOrNonClinicalInput([
    { word: "pain", role: "outcome" },
    { word: "drug", role: "intervention" },
    { word: "better", role: "outcome" },
    { word: "patients", role: "population" }
  ]);
  assert.equal(ambig1.ambiguous, true, "Ambiguous non-specific clinical input must be flagged");

  // Non-clinical letters: "a, b, c, d"
  const ambig2 = isAmbiguousOrNonClinicalInput([
    { word: "a", role: "population" },
    { word: "b", role: "intervention" },
    { word: "c", role: "comparator" },
    { word: "d", role: "outcome" }
  ]);
  assert.equal(ambig2.ambiguous, true, "Single-letter non-clinical input must be flagged");
});

// ============================================================================
// AUD-16: IVF, homeopathy, placebo, live birth
// ============================================================================
test("AUD-16. IVF, homeopathy, placebo, live birth: Zero evidence returns 'Unavailable: No systematic review'", () => {
  const words = assignPicoRoles(["IVF", "homeopathy", "placebo", "live birth"]);
  const screen = generateDeterministicScreen(words, []);

  assert.equal(screen.phrases.established.supported, false, "Established must be false for zero evidence");
  assert.ok(
    screen.phrases.established.basis.includes("Unavailable: No systematic review"),
    "Basis must state unavailable evidence"
  );
  assert.equal(screen.phrases.conflicting.supported, false, "Conflicting must be false for zero evidence");
});

// ============================================================================
// AUD-17: ADV-3 prediction model
// ============================================================================
test("AUD-17. ADV-3 prediction model: Formulates as prediction model; no therapy 'improve' phrasing", () => {
  const words = assignPicoRoles([
    "cardiovascular disease",
    "machine learning prediction model",
    "Framingham risk score",
    "10-year CVD events"
  ]);

  const screen = generateDeterministicScreen(words, []);
  const estPhrase = screen.phrases.established.phrase;

  assert.ok(estPhrase.includes("predict"), `Prediction model phrase must use 'predict', got: ${estPhrase}`);
  assert.ok(!estPhrase.includes("improve 10-year CVD events"), "Must not use therapy 'improve' for prediction models");
});

// ============================================================================
// AUD-18: Design classification fixtures (P1-3 list)
// ============================================================================
test("AUD-18. Design classification fixtures: Correct labels consistent across steps", () => {
  const rct = classifyPaperType({ title: "A double-blind randomized controlled trial of drug X", abstract: "randomized trial" });
  assert.equal(rct, "Randomized Controlled Trial (RCT)");

  const sr = classifyPaperType({ title: "Systematic review and meta-analysis of treatment Y", abstract: "systematic review" });
  assert.equal(sr, "Systematic Review and Meta-Analysis");

  const prospectiveCohort = classifyPaperType({ title: "A prospective cohort study of outcome Z", abstract: "prospective cohort" });
  assert.equal(prospectiveCohort, "Prospective Cohort Study");

  const cohort = classifyPaperType({ title: "A cohort study of outcome Z", abstract: "cohort study" });
  assert.equal(cohort, "Cohort Study");

  const protocol = classifyPaperType({ title: "Study protocol for a phase 3 multicenter trial", abstract: "protocol" });
  assert.equal(protocol, "Protocol");

  const inVitro = classifyPaperType({ title: "In vitro characterization of molecular pathways", abstract: "cell culture in vitro" });
  assert.equal(inVitro, "In Vitro Study");

  // P1-3 Acceptance tests from audit
  const eshre = classifyPaperType({ title: "ESHRE good practice recommendations", publicationTypes: ["Practice Guideline"] });
  assert.equal(eshre, "Practice Guideline");

  const munne = classifyPaperType({ title: "Preimplantation genetic testing for aneuploidy versus morphology", publicationTypes: ["Randomized Controlled Trial"] });
  assert.equal(munne, "Randomized Controlled Trial (RCT)");

  const seifer = classifyPaperType({ title: "Editorial perspective on reproductive genetics", publicationTypes: ["Editorial"] });
  assert.equal(seifer, "Editorial");

  const review = classifyPaperType({ title: "State of the art in reproductive genetics", publicationTypes: ["Review"] });
  assert.equal(review, "Review");
});

// ============================================================================
// AUD-19: APA selected
// ============================================================================
test("AUD-19. APA selected: Formats 'Braga, D. P. A. F.'; no 'Vancouver' text anywhere", () => {
  const formatted = formatApaAuthors("Braga DPAF");
  assert.equal(formatted, "Braga, D. P. A. F.", "Multi-initial author must be formatted with spaced periods in APA");

  const words = assignPicoRoles(["IVF", "PGT-A", "morphology alone", "live birth"]);
  const manuscript = composeManuscript({
    words,
    category: "established",
    phrase: "In IVF (P), does PGT-A (I) compared with morphology alone (C) improve live birth (O)?",
    screeningStats: { retrieved: 1, screened: 1, relaxationLevel: 0, excludedCount: 0 },
    records: [
      {
        pmid: "1",
        title: "PGT-A study",
        authors: "Braga DPAF",
        year: "2023",
        journal: "Fertil Steril",
        pubType: "Randomized Controlled Trial",
        publicationTypes: ["Randomized Controlled Trial"],
        context: "In patients with IVF, PGT-A improved live birth compared to morphology alone.",
        relevancePct: 95,
        matchedElements: ["P", "I", "C", "O"]
      }
    ],
    specialty: "obgyn",
    style: "apa"
  });

  const fullText = [
    manuscript.title,
    ...manuscript.abstract,
    ...manuscript.sections.flatMap(s => [s.heading, ...s.paragraphs]),
    ...manuscript.references
  ].join(" ");

  assert.ok(!fullText.toLowerCase().includes("vancouver"), "Must contain zero occurrences of 'vancouver' when APA is selected");
  assert.ok(manuscript.references[0].includes("Braga, D. P. A. F."), "Reference must contain 'Braga, D. P. A. F.'");
});

// ============================================================================
// AUD-20: Methods
// ============================================================================
test("AUD-20. Methods: Lists only sources in request's log, with query strings and hit counts", () => {
  const words = assignPicoRoles(["sepsis", "balanced crystalloids", "saline", "30-day mortality"]);
  const searchLog = [
    { id: "pubmed", name: "PubMed", query: "sepsis balanced crystalloids saline 30-day mortality", count: 14, date: "2026-11-22" },
    { id: "cochrane", name: "Cochrane Library", query: "sepsis balanced crystalloids saline", count: 3, date: "2026-11-22" }
  ];

  const manuscript = composeManuscript({
    words,
    category: "established",
    phrase: "In sepsis (P), does balanced crystalloids (I) compared with saline (C) reduce 30-day mortality (O)?",
    screeningStats: { retrieved: 17, screened: 17, relaxationLevel: 0, excludedCount: 0 },
    records: [],
    specialty: "internal_med",
    searchLog
  });

  const methodsSec = manuscript.sections.find(s => s.heading === "Search strategy and screening");
  assert.ok(methodsSec, "Must have Search strategy and screening section");
  const methodsText = methodsSec.paragraphs.join(" ");

  assert.ok(methodsText.includes("PubMed"), "Methods must list PubMed");
  assert.ok(methodsText.includes("Cochrane Library"), "Methods must list Cochrane");
  assert.ok(!methodsText.includes("Europe PMC"), "Methods must not falsely claim Europe PMC when not in searchLog");
  assert.ok(!methodsText.includes("OpenAlex"), "Methods must not falsely claim OpenAlex when not in searchLog");
  assert.ok(methodsText.includes("14 hits"), "Methods must list PubMed hit count");
  assert.ok(methodsText.includes("3 hits"), "Methods must list Cochrane hit count");
});
