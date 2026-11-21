import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCorpus,
  generateDeterministicScreen
} from "./deterministic-screen.ts";
import type { AuditableRef } from "./relevance.ts";
import { assignPicoRoles, type PicoWord } from "./pico-roles.ts";

test("SCR-1. classifyCorpus identifies established, conflicting, and gap signals in fixture corpus", () => {
  const fixtureCorpus: AuditableRef[] = [
    // 2 Reviews / Meta-analyses with established wording
    {
      title: "Growth hormone supplementation for poor responders in IVF: systematic review and meta-analysis",
      journal: "Hum Reprod Update",
      context: "Growth hormone significantly improves live birth rates and reduces cycle cancellation in poor ovarian response."
    },
    {
      title: "Systematic review of adjuvants in poor ovarian response protocols",
      journal: "Fertil Steril",
      context: "Intervention is recommended as standard of care in selected subgroups."
    },
    // 2 Conflicting records with "no significant difference" and controversy
    {
      title: "Randomized trial of adjuvant therapy in poor ovarian response",
      journal: "Reprod Biomed Online",
      context: "There was no significant difference in clinical pregnancy rates between treatment and placebo groups."
    },
    {
      title: "Controversial outcomes of growth hormone in in vitro fertilization",
      journal: "J Assist Reprod Genet",
      context: "Conflicting results and heterogeneous outcomes remain unclear across patient populations."
    }
  ];

  // 4 words, with "acupuncture" completely absent from all fixture records
  const words: PicoWord[] = [
    { word: "poor responders", role: "population" },
    { word: "growth hormone", role: "intervention" },
    { word: "usual care", role: "comparator" },
    { word: "acupuncture", role: "outcome" }
  ];

  const signals = classifyCorpus(fixtureCorpus, words);

  assert.ok(signals.established >= 2, `Expected >= 2 established signals, got ${signals.established}`);
  assert.ok(signals.conflicting >= 2, `Expected >= 2 conflicting signals, got ${signals.conflicting}`);
  assert.ok(signals.gap >= 1, `Expected >= 1 gap signals for absent word, got ${signals.gap}`);
});

test("SCR-2. Smoke fixture: 2 interventions assign I2 to conflicting comparator slot, established keeps usual care, and phrases are pairwise distinct", () => {
  const words: PicoWord[] = [
    { word: "poor responders", role: "population" },
    { word: "ivf", role: "intervention" },
    { word: "growth hormone", role: "intervention" },
    { word: "clinical pregnancy rate", role: "outcome" }
  ];

  const smallCorpus: AuditableRef[] = [
    {
      title: "IVF outcomes in poor responders: systematic review",
      journal: "Hum Reprod",
      context: "IVF with adjuvant growth hormone improves clinical pregnancy rate in poor responders."
    }
  ];

  const res = generateDeterministicScreen(words, smallCorpus, 0, 1);

  // Established keeps usual care in (C) and includes both interventions in (I)
  assert.ok(res.phrases.established.phrase.includes("usual care (C)"));
  assert.ok(res.phrases.established.phrase.includes("ivf or growth hormone (I)"));
  assert.ok(res.phrases.established.phrase.includes("poor responders (P)"));

  // Conflicting includes both interventions in (I) and I2 in (C)
  assert.ok(res.phrases.conflicting.phrase.includes("growth hormone (C)"));
  assert.ok(res.phrases.conflicting.phrase.includes("ivf or growth hormone (I)"));

  // All 3 phrases must be pairwise distinct
  assert.notEqual(res.phrases.established.phrase, res.phrases.conflicting.phrase);
  assert.notEqual(res.phrases.established.phrase, res.phrases.gap.phrase);
  assert.notEqual(res.phrases.conflicting.phrase, res.phrases.gap.phrase);

  // Every submitted word must appear somewhere across phrases and bases
  const allText = `${res.phrases.established.phrase} ${res.phrases.conflicting.phrase} ${res.phrases.gap.phrase} ${res.phrases.established.basis} ${res.phrases.conflicting.basis} ${res.phrases.gap.basis}`.toLowerCase();
  for (const w of words) {
    assert.ok(allText.includes(w.word.toLowerCase()), `Word '${w.word}' must appear in phrases or bases`);
  }
});

test("SCR-3. Comparator word fixture: uses submitted comparator with distinct templates (improve vs superior-to)", () => {
  const words: PicoWord[] = [
    { word: "short cervix", role: "population" },
    { word: "vaginal progesterone", role: "intervention" },
    { word: "cervical cerclage", role: "comparator" },
    { word: "preterm birth", role: "outcome" }
  ];

  const corpus: AuditableRef[] = [
    {
      title: "Vaginal progesterone versus cervical cerclage for women with short cervix",
      journal: "Ultrasound Obstet Gynecol",
      context: "Both interventions show efficacy in reducing preterm birth in short cervix."
    }
  ];

  const res = generateDeterministicScreen(words, corpus, 0, 1);

  // Both use cervical cerclage in (C)
  assert.ok(res.phrases.established.phrase.includes("cervical cerclage (C)"));
  assert.ok(res.phrases.established.phrase.includes("improve preterm birth (O)"));

  assert.ok(res.phrases.conflicting.phrase.includes("cervical cerclage (C)"));
  assert.ok(res.phrases.conflicting.phrase.includes("is vaginal progesterone (I) superior to cervical cerclage (C)"));

  // Pairwise distinctness
  assert.notEqual(res.phrases.established.phrase, res.phrases.conflicting.phrase);
  assert.notEqual(res.phrases.established.phrase, res.phrases.gap.phrase);
  assert.notEqual(res.phrases.conflicting.phrase, res.phrases.gap.phrase);
});

test("SCR-4. Zero-coverage fixture: unaddressed word is placed in gap phrase and basis states missing evidence", () => {
  const words: PicoWord[] = [
    { word: "poor responders", role: "population" },
    { word: "growth hormone", role: "intervention" },
    { word: "usual care", role: "comparator" },
    { word: "acupuncture", role: "outcome" }
  ];

  const corpus: AuditableRef[] = [
    {
      title: "Growth hormone in poor responders undergoing IVF: systematic review",
      journal: "Hum Reprod",
      context: "Growth hormone improves clinical outcomes compared with usual care."
    }
  ];

  const res = generateDeterministicScreen(words, corpus, 0, 1);

  // Gap phrase centers on the zero-coverage word 'acupuncture'
  assert.ok(res.phrases.gap.phrase.includes("acupuncture"));
  assert.ok(res.phrases.gap.basis.includes("acupuncture"));
  assert.ok(res.phrases.gap.basis.toLowerCase().includes("no screened record"));

  // Pairwise distinctness
  assert.notEqual(res.phrases.established.phrase, res.phrases.conflicting.phrase);
  assert.notEqual(res.phrases.established.phrase, res.phrases.gap.phrase);
  assert.notEqual(res.phrases.conflicting.phrase, res.phrases.gap.phrase);
});

test("SCR-5. All-covered fixture: gap phrase uses subgroup and adverse events variant and differs from established", () => {
  const words: PicoWord[] = [
    { word: "poor responders", role: "population" },
    { word: "growth hormone", role: "intervention" },
    { word: "placebo", role: "comparator" },
    { word: "live birth rate", role: "outcome" }
  ];

  // Corpus where every word has at least 2 matching records
  const corpus: AuditableRef[] = [
    {
      title: "Growth hormone vs placebo in poor responders: systematic review",
      journal: "Hum Reprod Update",
      context: "Improves live birth rate significantly in poor responders."
    },
    {
      title: "Live birth rate after growth hormone versus placebo in poor responders",
      journal: "Fertil Steril",
      context: "Poor responders receiving growth hormone vs placebo achieved higher live birth rate."
    }
  ];

  const res = generateDeterministicScreen(words, corpus, 0, 2);

  // Gap phrase uses subgroup/adverse events variant
  assert.ok(res.phrases.gap.phrase.includes("high-risk subgroups of poor responders (P)"));
  assert.ok(res.phrases.gap.phrase.includes("without additional adverse events (O)"));
  assert.notEqual(res.phrases.gap.phrase, res.phrases.established.phrase);

  // Pairwise distinctness
  assert.notEqual(res.phrases.established.phrase, res.phrases.conflicting.phrase);
  assert.notEqual(res.phrases.established.phrase, res.phrases.gap.phrase);
  assert.notEqual(res.phrases.conflicting.phrase, res.phrases.gap.phrase);
});

test("SCR-6. Zero-corpus edge case returns 3 valid, pairwise-distinct phrases with defaults", () => {
  const words: PicoWord[] = [
    { word: "thin endometrium", role: "population" },
    { word: "prp", role: "intervention" }
  ];

  const res = generateDeterministicScreen(words, [], 2, 0);

  assert.equal(res.source, "deterministic");
  assert.equal(res.corpusStats.retrieved, 0);
  assert.equal(res.corpusStats.screened, 0);
  assert.equal(res.corpusStats.relaxationLevel, 2);

  // Pairwise distinctness
  assert.notEqual(res.phrases.established.phrase, res.phrases.conflicting.phrase);
  assert.notEqual(res.phrases.established.phrase, res.phrases.gap.phrase);
  assert.notEqual(res.phrases.conflicting.phrase, res.phrases.gap.phrase);

  for (const cat of ["established", "conflicting", "gap"] as const) {
    const item = res.phrases[cat];
    assert.ok(item.phrase.includes("(P)"), `${cat} phrase must contain (P)`);
    assert.ok(item.phrase.includes("(I)"), `${cat} phrase must contain (I)`);
    assert.ok(item.phrase.includes("(C)"), `${cat} phrase must contain (C)`);
    assert.ok(item.phrase.includes("(O)"), `${cat} phrase must contain (O)`);
    assert.ok(item.phrase.includes("thin endometrium"));
    assert.ok(item.phrase.includes("prp"));
    assert.ok(item.basis.length > 5);
  }
});

test("SCR-7. AIMED preset case 1 (ObGyn): generates 3 distinct PICO phrases with correct categories", () => {
  const rawWords = ["short cervix", "progesterone", "preterm birth"];
  const words = assignPicoRoles(rawWords);

  const res = generateDeterministicScreen(words);

  assert.ok(res.phrases.established, "Must have established phrase");
  assert.ok(res.phrases.conflicting, "Must have conflicting phrase");
  assert.ok(res.phrases.gap, "Must have gap phrase");

  assert.equal(res.phrases.established.category, "established");
  assert.equal(res.phrases.conflicting.category, "conflicting");
  assert.equal(res.phrases.gap.category, "gap");

  // Pairwise distinctness
  assert.notEqual(res.phrases.established.phrase, res.phrases.conflicting.phrase);
  assert.notEqual(res.phrases.established.phrase, res.phrases.gap.phrase);
  assert.notEqual(res.phrases.conflicting.phrase, res.phrases.gap.phrase);

  // Markers
  for (const cat of ["established", "conflicting", "gap"] as const) {
    const p = res.phrases[cat].phrase;
    assert.ok(p.includes("(P)"), `${cat} phrase must contain (P)`);
    assert.ok(p.includes("(I)"), `${cat} phrase must contain (I)`);
    assert.ok(p.includes("(C)"), `${cat} phrase must contain (C)`);
    assert.ok(p.includes("(O)"), `${cat} phrase must contain (O)`);
    assert.ok(p.includes("short cervix"));
    assert.ok(p.includes("progesterone"));
  }
});

test("SCR-8. AIMED preset case 2 (Cardiology): generates 3 distinct PICO phrases with correct categories", () => {
  const rawWords = ["heart failure", "sglt2 inhibitors", "hospitalization"];
  const words = assignPicoRoles(rawWords);

  const res = generateDeterministicScreen(words);

  assert.ok(res.phrases.established, "Must have established phrase");
  assert.ok(res.phrases.conflicting, "Must have conflicting phrase");
  assert.ok(res.phrases.gap, "Must have gap phrase");

  assert.equal(res.phrases.established.category, "established");
  assert.equal(res.phrases.conflicting.category, "conflicting");
  assert.equal(res.phrases.gap.category, "gap");

  // Pairwise distinctness
  assert.notEqual(res.phrases.established.phrase, res.phrases.conflicting.phrase);
  assert.notEqual(res.phrases.established.phrase, res.phrases.gap.phrase);
  assert.notEqual(res.phrases.conflicting.phrase, res.phrases.gap.phrase);

  // Markers
  for (const cat of ["established", "conflicting", "gap"] as const) {
    const p = res.phrases[cat].phrase;
    assert.ok(p.includes("(P)"), `${cat} phrase must contain (P)`);
    assert.ok(p.includes("(I)"), `${cat} phrase must contain (I)`);
    assert.ok(p.includes("(C)"), `${cat} phrase must contain (C)`);
    assert.ok(p.includes("(O)"), `${cat} phrase must contain (O)`);
    assert.ok(p.includes("heart failure"));
    assert.ok(p.includes("sglt2 inhibitors"));
  }
});

test("HOTFIX-2. Regression (a) & (d): CASE A word set has dienogest in all 3 phrases and phrases are pairwise distinct", () => {
  const words: PicoWord[] = [
    { word: "endometriosis", role: "population" },
    { word: "progesterone", role: "intervention" },
    { word: "dienogest", role: "intervention" },
    { word: "pain", role: "outcome" }
  ];

  const corpus: AuditableRef[] = [
    {
      title: "Dienogest versus progesterone in endometriosis for pelvic pain: randomized trial",
      journal: "Hum Reprod",
      context: "Both dienogest and progesterone reduce pelvic pain in endometriosis patients."
    }
  ];

  const res = generateDeterministicScreen(words, corpus, 0, 1);

  // (a) assert dienogest appears in ALL THREE phrases
  assert.ok(res.phrases.established.phrase.includes("dienogest"), "dienogest in established");
  assert.ok(res.phrases.conflicting.phrase.includes("dienogest"), "dienogest in conflicting");
  assert.ok(res.phrases.gap.phrase.includes("dienogest"), "dienogest in gap");

  // Every submitted word appears in all 3 phrases verbatim
  for (const cat of ["established", "conflicting", "gap"] as const) {
    const p = res.phrases[cat].phrase.toLowerCase();
    for (const w of words) {
      assert.ok(p.includes(w.word.toLowerCase()), `${cat} phrase must contain '${w.word}'`);
    }
  }

  // (d) pairwise phrase distinctness still holds for the CASE A set
  assert.notEqual(res.phrases.established.phrase, res.phrases.conflicting.phrase);
  assert.notEqual(res.phrases.established.phrase, res.phrases.gap.phrase);
  assert.notEqual(res.phrases.conflicting.phrase, res.phrases.gap.phrase);
});

test("HOTFIX-2. Regression (b): outcome word with zero corpus coverage appears verbatim in every phrase", () => {
  const words: PicoWord[] = [
    { word: "endometriosis", role: "population" },
    { word: "dienogest", role: "intervention" },
    { word: "usual care", role: "comparator" },
    { word: "chronic fatigue", role: "outcome" }
  ];

  // Corpus where 'chronic fatigue' has 0 matches
  const corpus: AuditableRef[] = [
    {
      title: "Dienogest in endometriosis: systematic review and meta-analysis",
      journal: "Fertil Steril",
      context: "Dienogest improves clinical symptoms and pelvic pain compared with usual care."
    }
  ];

  const res = generateDeterministicScreen(words, corpus, 0, 1);

  // Outcome word must appear verbatim in all three phrases (no "clinical outcomes" replacement)
  assert.ok(res.phrases.established.phrase.includes("chronic fatigue"), "Established must include chronic fatigue verbatim");
  assert.ok(res.phrases.conflicting.phrase.includes("chronic fatigue"), "Conflicting must include chronic fatigue verbatim");
  assert.ok(res.phrases.gap.phrase.includes("chronic fatigue"), "Gap must include chronic fatigue verbatim");

  for (const cat of ["established", "conflicting", "gap"] as const) {
    const p = res.phrases[cat].phrase.toLowerCase();
    for (const w of words) {
      assert.ok(p.includes(w.word.toLowerCase()), `${cat} phrase must contain '${w.word}'`);
    }
  }
});

test("HOTFIX-2. Regression (c): 5-word input with leftovers has every word in every phrase and trailing clause renders", () => {
  const words: PicoWord[] = [
    { word: "PCOS", role: "population" },
    { word: "letrozole", role: "intervention" },
    { word: "clomiphene citrate", role: "intervention" },
    { word: "live birth rate", role: "outcome" },
    { word: "ovulation induction", role: "intervention" }
  ];

  const res = generateDeterministicScreen(words, [], 0, 0);

  // Trailing clause with leftover word appears in every phrase
  for (const cat of ["established", "conflicting", "gap"] as const) {
    const p = res.phrases[cat].phrase;
    assert.ok(p.includes(", with attention to ovulation induction?"), `${cat} phrase must contain trailing clause with leftover`);
    for (const w of words) {
      assert.ok(p.toLowerCase().includes(w.word.toLowerCase()), `${cat} phrase must contain '${w.word}'`);
    }
  }
});
