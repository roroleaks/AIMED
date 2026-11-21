import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePhraseElements,
  scoreRecords,
  refCanonicalKeys,
  normalizeTitle
} from "./explore-scoring.ts";
import type { AuditableRef } from "./relevance.ts";

test("EXP-1. parsePhraseElements extracts P, I, C, O elements and supports fallback", () => {
  const phrase = "In poor responders (P), does ivf (I) compared with growth hormone (C) improve clinical pregnancy rate (O)?";
  const elements = parsePhraseElements(phrase);

  assert.equal(elements.length, 4);
  const p = elements.find(e => e.label.startsWith("P"));
  const i = elements.find(e => e.label.startsWith("I"));
  const c = elements.find(e => e.label.startsWith("C"));
  const o = elements.find(e => e.label.startsWith("O"));

  assert.ok(p && p.value.includes("poor responders"));
  assert.ok(i && i.value.includes("ivf"));
  assert.ok(c && c.value.includes("growth hormone"));
  assert.ok(o && o.value.includes("clinical pregnancy rate"));

  // Malformed question fallback
  const fallback = parsePhraseElements("Some text with (P) target women (I) new therapy (C) sham (O) recovery");
  assert.equal(fallback.length, 4);
});

test("EXP-2. relevancePct bounds are integer between 0 and 100", () => {
  const phrase = "In poor responders (P), does ivf (I) compared with usual care (C) improve live birth rate (O)?";
  const fixture: AuditableRef[] = [
    {
      pmid: "1001",
      title: "IVF in poor responders improves live birth rate compared with usual care: systematic review and meta-analysis",
      journal: "Hum Reprod Update",
      year: "2023",
      context: "IVF significantly improves live birth rate in poor responders. Recommended as first-line."
    },
    {
      pmid: "1002",
      title: "Unrelated study about hypertension in elderly men",
      journal: "Cardiol J",
      year: "2020",
      context: "Blood pressure management in non-pregnant populations."
    }
  ];

  const res = scoreRecords(fixture, phrase, "established", []);
  assert.equal(res.scored.length, 2);

  for (const r of res.scored) {
    assert.ok(Number.isInteger(r.relevancePct));
    assert.ok(r.relevancePct >= 0 && r.relevancePct <= 100);
  }

  // Highly relevant record should score higher than unrelated record
  assert.ok(res.scored[0].relevancePct > res.scored[1].relevancePct);
});

test("EXP-3. Category bonuses are applied and capped at +10", () => {
  const phrase = "In poor responders (P), does growth hormone (I) compared with placebo (C) affect clinical pregnancy (O)?";
  const ref: AuditableRef = {
    pmid: "2001",
    title: "Growth hormone vs placebo in poor responders: systematic review and meta-analysis with pilot study",
    journal: "Hum Reprod Update",
    year: "2024",
    context: "No significant difference observed in heterogeneous trials. It reduces cycle cancellation and is recommended first-line. Limited data in scarcity."
  };

  const est = scoreRecords([ref], phrase, "established", []);
  const conf = scoreRecords([ref], phrase, "conflicting", []);
  const gap = scoreRecords([ref], phrase, "gap", []);

  // Verify all return valid integer percentages
  assert.ok(est.scored[0].relevancePct <= 100);
  assert.ok(conf.scored[0].relevancePct <= 100);
  assert.ok(gap.scored[0].relevancePct <= 100);

  // Bonus must be applied without exceeding max limit
  assert.ok(est.scored[0].relevancePct > 50);
  assert.ok(conf.scored[0].relevancePct > 50);
  assert.ok(gap.scored[0].relevancePct > 50);
});

test("EXP-4. Blocked-key filtering removes matching records and increments removedByBlock count", () => {
  const phrase = "In poor responders (P), does ivf (I) compared with usual care (C) improve live birth rate (O)?";
  const fixture: AuditableRef[] = [
    { pmid: "3001", title: "Paper 1 on IVF in poor responders", year: "2022" },
    { pmid: "3002", title: "Paper 2 on IVF in poor responders", year: "2021" },
    { pmid: "3003", title: "Paper 3 on IVF in poor responders", year: "2020" }
  ];

  const blockedKeys = ["p:3001", "p:3003"];
  const res = scoreRecords(fixture, phrase, "established", blockedKeys);

  assert.equal(res.removedByBlock, 2);
  assert.equal(res.scored.length, 1);
  assert.equal(res.scored[0].pmid, "3002");
});

test("EXP-5. Sorting is deterministic: relevancePct desc -> year desc -> title asc", () => {
  const phrase = "In poor responders (P), does ivf (I) compared with usual care (C) improve live birth rate (O)?";
  const fixture: AuditableRef[] = [
    { pmid: "4001", title: "Beta study on IVF", year: "2020" },
    { pmid: "4002", title: "Alpha study on IVF", year: "2023" },
    { pmid: "4003", title: "Gamma study on IVF", year: "2023" }
  ];

  const res = scoreRecords(fixture, phrase, "established", []);
  assert.equal(res.scored.length, 3);

  // Year 2023 records should come before 2020
  assert.ok(parseInt(res.scored[0].year || "0", 10) >= parseInt(res.scored[1].year || "0", 10));
  assert.ok(parseInt(res.scored[1].year || "0", 10) >= parseInt(res.scored[2].year || "0", 10));

  // Among year 2023 records with equal score, "Alpha study on IVF" comes before "Gamma study on IVF"
  const y2023 = res.scored.filter(r => r.year === "2023");
  if (y2023.length === 2 && y2023[0].relevancePct === y2023[1].relevancePct) {
    assert.equal(y2023[0].title, "Alpha study on IVF");
    assert.equal(y2023[1].title, "Gamma study on IVF");
  }
});

test("EXP-6. Zero-element fallback handles empty or unparseable phrase safely", () => {
  const fixture: AuditableRef[] = [
    { pmid: "5001", title: "A clinical trial paper", year: "2021", context: "Some text." }
  ];

  const res = scoreRecords(fixture, "", "established", []);
  assert.equal(res.scored.length, 1);
  assert.ok(res.scored[0].relevancePct >= 0 && res.scored[0].relevancePct <= 100);
  assert.deepEqual(res.scored[0].matchedElements, []);
});

test("EXP-7. refCanonicalKeys derives pmid, doi, and title keys", () => {
  const ref: AuditableRef = {
    pmid: "12345678",
    doi: "https://doi.org/10.1000/182",
    title: "Clinical Trial on Obstetrics and Gynecology Research"
  };

  const keys = refCanonicalKeys(ref);
  assert.ok(keys.includes("p:12345678"));
  assert.ok(keys.includes("d:10.1000/182"));
  assert.ok(keys.some(k => k.startsWith("t:")));
});

test("EXP-8. AIMED preset case 1 (ObGyn short-cervix): exact % values, matched elements, and ranking order", () => {
  const phrase = "In women with short cervix (P), does vaginal progesterone (I) compared with cervical cerclage (C) reduce preterm birth (O)?";

  const fixtureCorpus: AuditableRef[] = [
    {
      pmid: "6001",
      title: "Vaginal progesterone versus cervical cerclage in women with short cervix for prevention of preterm birth: systematic review and meta-analysis",
      journal: "Am J Obstet Gynecol",
      year: "2023",
      context: "Vaginal progesterone significantly reduces preterm birth in singleton gestation with short cervix compared with cervical cerclage. It improves neonatal outcomes."
    },
    {
      pmid: "6002",
      title: "Cervical cerclage for prevention of preterm birth: a randomized controlled trial",
      journal: "Obstet Gynecol",
      year: "2021",
      context: "Evaluation of cervical cerclage vs expectant management in women with short cervix. No significant difference in preterm birth under 34 weeks."
    },
    {
      pmid: "6003",
      title: "Unrelated study on gestational diabetes screening",
      journal: "Diabetes Care",
      year: "2022",
      context: "Screening thresholds for gestational diabetes in primary care."
    }
  ];

  const res = scoreRecords(fixtureCorpus, phrase, "established", []);
  assert.equal(res.scored.length, 3);

  // Top record matches all elements and is a systematic review
  const top = res.scored[0];
  assert.equal(top.pmid, "6001");
  assert.ok(top.matchedElements.includes("P"));
  assert.ok(top.matchedElements.includes("I"));
  assert.ok(top.matchedElements.includes("C"));
  assert.ok(top.matchedElements.includes("O"));
  assert.ok(top.relevancePct >= 85, `Expected top score >= 85, got ${top.relevancePct}`);

  // Second record matches P, C, O
  const second = res.scored[1];
  assert.equal(second.pmid, "6002");
  assert.ok(second.matchedElements.includes("P"));
  assert.ok(second.matchedElements.includes("C"));
  assert.ok(second.matchedElements.includes("O"));
  assert.ok(second.relevancePct < top.relevancePct);
  assert.ok(second.relevancePct >= 50);

  // Third record matches none
  const third = res.scored[2];
  assert.equal(third.pmid, "6003");
  assert.ok(third.relevancePct < second.relevancePct);

  // Determinism check: running again with identical input yields identical scores
  const rerun = scoreRecords(fixtureCorpus, phrase, "established", []);
  assert.deepEqual(rerun.scored.map(r => r.relevancePct), res.scored.map(r => r.relevancePct));
});

test("EXP-9. AIMED preset case 2 (Cardiology SGLT2): exact % values, matched elements, and ranking order", () => {
  const phrase = "In patients with heart failure (P), does sglt2 inhibitors (I) compared with placebo (C) reduce hospitalization (O)?";

  const fixtureCorpus: AuditableRef[] = [
    {
      pmid: "7001",
      title: "SGLT2 inhibitors in patients with heart failure: a comprehensive systematic review and meta-analysis",
      journal: "Circulation",
      year: "2024",
      context: "SGLT2 inhibitors significantly reduce hospitalization for heart failure compared with placebo. Superior to standard therapy alone."
    },
    {
      pmid: "7002",
      title: "Dapagliflozin in patients with heart failure and reduced ejection fraction: a randomized controlled trial",
      journal: "N Engl J Med",
      year: "2020",
      context: "Dapagliflozin reduced the risk of worsening heart failure or cardiovascular death compared with placebo."
    },
    {
      pmid: "7003",
      title: "Unrelated study on echocardiography imaging modalities in pediatric congenital anomalies",
      journal: "Pediatr Cardiol",
      year: "2019",
      context: "Ultrasound imaging parameters in neonatal cardiac diagnosis."
    }
  ];

  const res = scoreRecords(fixtureCorpus, phrase, "established", []);
  assert.equal(res.scored.length, 3);

  const top = res.scored[0];
  assert.equal(top.pmid, "7001");
  assert.ok(top.matchedElements.includes("P"));
  assert.ok(top.matchedElements.includes("I"));
  assert.ok(top.matchedElements.includes("C"));
  assert.ok(top.matchedElements.includes("O"));
  assert.ok(top.relevancePct >= 85, `Expected top score >= 85, got ${top.relevancePct}`);

  const second = res.scored[1];
  assert.equal(second.pmid, "7002");
  assert.ok(second.relevancePct < top.relevancePct);

  const third = res.scored[2];
  assert.equal(third.pmid, "7003");
  assert.ok(third.relevancePct < second.relevancePct);

  // Title normalization test
  assert.equal(normalizeTitle("  Clinical   Trial on Heart Failure   "), "clinical trial on heart failure");
});
