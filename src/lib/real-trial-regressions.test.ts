import test from "node:test";
import assert from "node:assert/strict";
import { parseClinicalScenario, auxVerbFor, outcomeVerbFor } from "./clinical-semantics.ts";
import { extractPicoFromQuestion } from "./pico-parser.ts";
import { generateDeterministicGapAnalysis } from "./deterministic-gap.ts";
import { generateDeterministicCommentary, extractFinding } from "./deterministic-commentary.ts";
import { populationConflict, auditRef, formatReference, type AuditableRef } from "./relevance.ts";
import { finalizeClaims, reportedDirection, assertedDirection } from "./claim-finalization.ts";
import { buildEvidenceSet } from "./evidence-set.ts";
import { isNonEvidenceTitle, decodeHtmlEntities } from "./literature-sources.ts";

/**
 * Regressions found by a real end-to-end trial (live PubMed, CrossRef, DOAJ, PMC) of the tag-word
 * -> gap map -> PICO -> commentary -> PDF/DOCX pipeline. Each test names the defect it pins down.
 */

const HFREF = "SGLT2 inhibitors, heart failure with reduced ejection fraction, dapagliflozin, placebo, cardiovascular death, hospitalization";

test("RT1. a drug of the intervention's class is not the comparator, and placebo is", () => {
  const s = parseClinicalScenario(HFREF, "cardiology");
  assert.equal(s.population, "heart failure with reduced ejection fraction");
  assert.equal(s.intervention, "SGLT2 inhibitors");
  assert.equal(s.comparator, "placebo");
  // Previously "dapagliflozin" fell through to the outcome slot: "increase dapagliflozin (O)".
  for (const q of s.suggestedQuestions) assert.ok(!/dapagliflozin \(O\)/i.test(q.question), q.question);
});

test("RT2. questions use 'do' for plural interventions and 'reduce' for adverse outcomes", () => {
  const s = parseClinicalScenario(HFREF, "cardiology");
  assert.match(s.suggestedQuestions[0].question, /\(P\), do SGLT2 inhibitors \(I\)/);
  assert.match(s.suggestedQuestions[0].question, /reduce .*cardiovascular death/);
  for (const q of s.suggestedQuestions) {
    assert.ok(!/optimize hospitali[sz]ation|improve .*mortality|increase .*decline/i.test(q.question), q.question);
  }
  assert.equal(auxVerbFor("SGLT2 inhibitors"), "do");
  assert.equal(auxVerbFor("dapagliflozin"), "does");
  assert.equal(outcomeVerbFor("eGFR decline"), "reduce");
  assert.equal(outcomeVerbFor("percentage total body weight loss"), "improve");
  assert.equal(outcomeVerbFor("functional independence (mRS 0-2)"), "improve");
});

test("RT3. typed arms keep their order and the clinician's own wording", () => {
  const s = parseClinicalScenario("acute uncomplicated appendicitis, antibiotics, laparoscopic appendectomy, treatment failure, recurrence", "surgery");
  assert.equal(s.intervention, "antibiotics");
  assert.equal(s.comparator, "laparoscopic appendectomy");
  assert.equal(s.outcomes[0], "treatment failure");
});

test("RT4. a population qualifier is moved from O to P, and cross-specialty scales do not leak", () => {
  const stroke = parseClinicalScenario("acute ischemic stroke, large vessel occlusion, mechanical thrombectomy, alteplase, functional outcome mRS", "neurology");
  assert.equal(stroke.population, "acute ischemic stroke with large vessel occlusion");
  assert.ok(!stroke.outcomes.includes("large vessel occlusion"));
  const crohn = parseClinicalScenario("Crohn's disease, risankizumab, ustekinumab, endoscopic healing, clinical remission", "gastroenterology");
  assert.ok(!crohn.outcomes.some(o => /MADRS/.test(o)), crohn.outcomes.join("; "));
});

test("RT5. an intervention with its own parentheses survives question parsing", () => {
  const q = "In patients with chronic obstructive pulmonary disease (P), does triple inhaled therapy (ICS/LABA/LAMA) (I) compared with LABA LAMA (C) reduce the rate of annualized exacerbation (O)?";
  assert.equal(extractPicoFromQuestion(q, q).intervention, "triple inhaled therapy (ICS/LABA/LAMA)");
  const p = "In patients with acute ischemic stroke with large vessel occlusion (P), does mechanical thrombectomy (I) compared with alteplase (C) improve functional outcome mRS (O)?";
  assert.equal(extractPicoFromQuestion(p, p, "neurology").condition, "acute ischemic stroke with large vessel occlusion");
});

test("RT6. deterministic gap points are about the typed PICO, without obstetric boilerplate", () => {
  const g = generateDeterministicGapAnalysis(HFREF, "cardiology");
  const text = JSON.stringify(g).toLowerCase();
  assert.ok(!/gestational|reproductive|pediatric outcomes/.test(text), "obstetric phrases leaked into cardiology");
  for (const p of [...g.known, ...g.uncertain]) {
    assert.ok(p.point.includes("SGLT2 inhibitors"), p.point);
    assert.ok(/^\S+/.test(p.searchQuery || ""), "search query present");
  }
  // Point-specific words lead the query so truncation cannot make every point search the same thing.
  const leads = new Set([...g.known, ...g.uncertain].map(p => (p.searchQuery || "").split(" ")[0]));
  assert.ok(leads.size >= 5, `queries too similar: ${[...leads].join(", ")}`);
});

test("RT7. HFpEF / DELIVER records do not count as the HFrEF population", () => {
  const pop = "heart failure with reduced ejection fraction";
  assert.equal(populationConflict(pop, "Dapagliflozin in Heart Failure with Mildly Reduced or Preserved Ejection Fraction"), true);
  assert.equal(populationConflict(pop, "Dapagliflozin and Mode of Death in Heart Failure With Improved Ejection Fraction: A Post Hoc Analysis of the DELIVER Trial"), true);
  assert.equal(populationConflict(pop, "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction"), false);
  const audit = auditRef(
    { title: "Dapagliflozin in Heart Failure with Mildly Reduced or Preserved Ejection Fraction", context: "heart failure ejection fraction dapagliflozin placebo" },
    [{ label: "Population", value: "Patients with heart failure with reduced ejection fraction" }, { label: "Intervention", value: "dapagliflozin" }]
  );
  assert.equal(audit.population, false);
});

test("RT8. population names are not claims, and 'did not significantly reduce' is a null finding", () => {
  assert.equal(assertedDirection("Patients with heart failure with reduced ejection fraction were enrolled."), null);
  assert.equal(
    reportedDirection({ title: "Dapagliflozin in heart failure with reduced ejection fraction", context: "In-hospital initiation of dapagliflozin did not significantly reduce the risk of cardiovascular death." }),
    "no-difference"
  );
  assert.equal(assertedDirection("We did not see significant reduction in UACR."), "no-difference");
});

const DAPA: AuditableRef = {
  pmid: "31535829",
  authors: "McMurray JJV, Solomon SD, Inzucchi SE, Kober L, Kosiborod MN, Martinez FA, Ponikowski P",
  year: "2019",
  title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction",
  journal: "N Engl J Med",
  doi: "10.1056/NEJMoa1911303",
  url: "https://pubmed.ncbi.nlm.nih.gov/31535829/",
  pubType: "Randomized Controlled Trial",
  context:
    "BACKGROUND: SGLT2 inhibitors in heart failure with reduced ejection fraction. METHODS: Patients were randomized to dapagliflozin or placebo. " +
    "RESULTS: The primary outcome occurred in 16.3% and 21.2% (hazard ratio, 0.74; 95% CI, 0.65 to 0.85). " +
    "CONCLUSIONS: Among patients with heart failure and a reduced ejection fraction, the risk of worsening heart failure or death from cardiovascular causes was lower among those who received dapagliflozin than among those who received placebo. (Funded by AstraZeneca; DAPA-HF ClinicalTrials.gov number, NCT03036124.)"
};

test("RT9. the quoted finding is the labelled conclusion, never an estimate or a registration line", () => {
  const f = extractFinding(DAPA, "cardiovascular death or heart failure hospitalization");
  assert.match(f, /^Among patients with heart failure and a reduced ejection fraction, the risk of worsening heart failure/);
  assert.ok(!/NCT|95%|hazard/i.test(f));
  assert.ok(isNonEvidenceTitle("Abstract TP29: Benefit of Intravenous Alteplase Prior to Thrombectomy"));
  assert.ok(isNonEvidenceTitle("Chemical Optimization of Cerebral Embolectomy 2 (CHOICE 2) trial: study protocol."));
  assert.ok(!isNonEvidenceTitle("Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction"));
  assert.equal(decodeHtmlEntities("10 mL/kg/d &#xb7; 75 kg = 750&#xa0;mL"), "10 mL/kg/d · 75 kg = 750 mL");
});

test("RT10. Vancouver references use NLM author form with et al.", () => {
  const ref = formatReference(DAPA);
  assert.match(ref, /^McMurray JJV, Solomon SD, Inzucchi SE, Kober L, Kosiborod MN, Martinez FA, et al\. Dapagliflozin/);
  assert.match(formatReference({ ...DAPA, authors: "F. Zannad, J. Ferreira, S. Pocock" }), /^Zannad F, Ferreira J, Pocock S\./);
});

test("RT11. the commentary keeps paragraphs and headings, survives claim finalization, and titles keep acronyms", async () => {
  const elements = [
    { label: "P — Population", value: "Patients with heart failure with reduced ejection fraction" },
    { label: "I — Intervention", value: "SGLT2 inhibitors" },
    { label: "C — Comparator", value: "placebo" },
    { label: "O — Outcome", value: "cardiovascular death or heart failure hospitalization" }
  ];
  const evidenceSet = await buildEvidenceSet([DAPA]);
  const out = generateDeterministicCommentary({
    selectedQuestion: "In patients with heart failure with reduced ejection fraction, do SGLT2 inhibitors compared with placebo reduce cardiovascular death or heart failure hospitalization?",
    outcomesText: "cardiovascular death or heart failure hospitalization",
    pool: evidenceSet.retainedRecords as AuditableRef[],
    elements
  });
  assert.match(String(out.title), /^SGLT2 Inhibitors for Reducing Cardiovascular Death/);
  assert.ok(!/Optimizing/.test(String(out.title)));
  const finalized = finalizeClaims({
    fields: { abstract: String(out.abstract), introduction: String(out.introduction), discussion: String(out.discussion), conclusion: String(out.conclusion) },
    evidenceSet,
    elements
  });
  assert.deepEqual(finalized.warnings, [], "the commentary must survive claim finalization untouched");
  assert.match(finalized.fields.discussion, /\n\n#### Study-by-Study Appraisal\n\n/, "sub-headings keep their own lines");
  assert.match(finalized.fields.abstract, /\n\n\*\*Objective:\*\*/, "abstract labels keep their own paragraphs");
  assert.match(finalized.fields.discussion, /\n- \*\*Markers of response:\*\*/, "bullets keep their own lines");
  assert.match(String(out.abstract), /One retained record reports a favourable direction/);
});

test("RT12. claim finalization adds the uncertainty caveat at most once per field", async () => {
  const evidenceSet = await buildEvidenceSet([DAPA]);
  const res = finalizeClaims({
    fields: { discussion: "Statins reduce strokes. Aspirin prevents fractures. Vitamin D improves mood." },
    evidenceSet,
    elements: []
  });
  assert.equal((res.fields.discussion.match(/unresolved uncertainty/g) || []).length, 1);
});
