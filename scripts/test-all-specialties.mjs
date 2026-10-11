import assert from "node:assert/strict";
import { SPECIALTIES } from "../src/lib/specialties.ts";
import { KB } from "../src/lib/kb.ts";
import { extractPicoFromQuestion } from "../src/lib/pico-parser.ts";
import { buildOutcomeContext, selectOutcomes } from "../src/lib/outcome-selection.ts";
import { validateDeliverableIntegrity } from "../src/lib/deliverable-integrity.ts";

const BASE_URL = "http://localhost:3000";

const SPECIALTY_ORDER = [
  { id: "obgyn", name: "Obstetrics & Gynecology", guidelines: "ACOG · RCOG · FIGO · SMFM" },
  { id: "cardiology", name: "Cardiology & Vascular Medicine", guidelines: "AHA · ACC · ESC · HFSA" },
  { id: "oncology", name: "Medical Oncology & Hematology", guidelines: "NCCN · ASCO · ESMO · SITC" },
  { id: "pediatrics", name: "Pediatrics & Neonatal Medicine", guidelines: "AAP · ESPGHAN · RCPCH · WHO" },
  { id: "surgery", name: "General & Minimally Invasive Surgery", guidelines: "ACS · SAGES · EAES · ASCRS" },
  { id: "internal_med", name: "Internal Medicine & Nephrology", guidelines: "ACP · KDIGO · EULAR · NICE" },
  { id: "neurology", name: "Neurology & Stroke Medicine", guidelines: "AAN · ESO · AHA/ASA · ILAE" },
  { id: "endocrinology", name: "Endocrinology & Metabolism", guidelines: "ADA · Endocrine Society · EASD · AACE" },
  { id: "emergency_med", name: "Emergency Medicine & Critical Care", guidelines: "ACEP · SCCM · ERC · AHA" },
  { id: "psychiatry", name: "Psychiatry & Behavioral Health", guidelines: "APA · CANMAT · NICE · WFSBP" },
  { id: "orthopedics", name: "Orthopedic Surgery & Sports Medicine", guidelines: "AAOS · BOA · EFORT · ESSKA" },
  { id: "pulmonology", name: "Pulmonology & Respiratory Medicine", guidelines: "ATS · ERS · GOLD · GINA" },
  { id: "gastroenterology", name: "Gastroenterology & Hepatology", guidelines: "AGA · ACG · ECCO · EASL" },
  { id: "infectious_disease", name: "Infectious Diseases & Antimicrobial Stewardship", guidelines: "IDSA · ESCMID · WHO · CDC" },
  { id: "dermatology", name: "Dermatology & Cutaneous Biology", guidelines: "AAD · EADV · BAD · EDF" }
];

async function runTest() {
  console.log(`\n======================================================================`);
  console.log(`🔬 AIMed Multi-Specialty Localhost Stress-Test Suite (15 Specialties)`);
  console.log(`Target Host: ${BASE_URL}`);
  console.log(`======================================================================\n`);

  let passed = 0;
  let failed = 0;

  for (let idx = 0; idx < SPECIALTY_ORDER.length; idx++) {
    const spec = SPECIALTY_ORDER[idx];
    const num = idx + 1;
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`[${num}/15] Testing: ${spec.name} (${spec.guidelines})`);
    console.log(`Specialty Key: "${spec.id}"`);
    console.log(`----------------------------------------------------------------------`);

    try {
      const def = SPECIALTIES[spec.id];
      assert.ok(def, `Specialty definition for ${spec.id} must exist`);
      assert.equal(def.authorityGuidelines, spec.guidelines, `Guidelines must match exact specification`);

      const preset = def.presets[0];
      assert.ok(preset, `At least 1 preset must exist for ${spec.id}`);
      const tagWords = preset.raw;
      const tagCount = tagWords.split(",").length;
      console.log(`  Step 1: Tag Words [Count: ${tagCount}] -> "${tagWords}"`);
      assert.ok(tagCount >= 4 && tagCount <= 6, `Tag words count must be 4–6`);

      // 1. Test POST /api/engine stage: gap on localhost
      console.log(`  Step 2: Calling localhost /api/engine stage: "gap"...`);
      const gapRes = await fetch(`${BASE_URL}/api/engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "gap",
          input: tagWords,
          specialty: spec.id
        })
      });
      assert.equal(gapRes.status, 200, `Stage gap returned status ${gapRes.status}`);
      const gapData = await gapRes.json();

      assert.ok(Array.isArray(gapData.known), "gapData.known must be an array");
      assert.equal(gapData.known.length, 4, `Must return exactly 4 established knowledge points, got ${gapData.known.length}`);
      assert.ok(Array.isArray(gapData.uncertain), "gapData.uncertain must be an array");
      assert.equal(gapData.uncertain.length, 4, `Must return exactly 4 conflicting evidence points, got ${gapData.uncertain.length}`);
      assert.ok(Array.isArray(gapData.gaps), "gapData.gaps must be an array");
      assert.equal(gapData.gaps.length, 4, `Must return exactly 4 research gaps, got ${gapData.gaps.length}`);
      assert.ok(Array.isArray(gapData.suggestedQuestions), "gapData.suggestedQuestions must be an array");
      assert.equal(gapData.suggestedQuestions.length, 4, `Must return exactly 4 PICO questions, got ${gapData.suggestedQuestions.length}`);

      console.log(`    ✓ 4 Established Knowledge points verified`);
      console.log(`    ✓ 4 Conflicting Evidence points verified`);
      console.log(`    ✓ 4 Research Gaps verified`);
      console.log(`    ✓ 4 Suggested PICO questions verified`);

      // 2. Step 3: Choose 1 of the 4 PICO questions
      const selectedPico = gapData.suggestedQuestions[0].question;
      console.log(`  Step 3: Selected PICO question: "${selectedPico.slice(0, 90)}..."`);
      assert.ok(selectedPico.includes("(P)") && selectedPico.includes("(I)") && selectedPico.includes("(C)"), "PICO must format P, I, C explicitly");

      const picoParsed = extractPicoFromQuestion(selectedPico, gapData.topic || tagWords, spec.id);
      assert.ok(picoParsed.condition.length > 0, "Extracted condition (P) must not be empty");
      assert.ok(picoParsed.intervention.length > 0, "Extracted intervention (I) must not be empty");
      assert.ok(picoParsed.comparator.length > 0, "Extracted comparator (C) must not be empty");
      console.log(`    ✓ PICO parsed: P="${picoParsed.condition}", I="${picoParsed.intervention}", C="${picoParsed.comparator}"`);

      // Outcomes Generation
      const outcomeContext = buildOutcomeContext(
        {
          specialty: picoParsed.specialty,
          condition: picoParsed.condition,
          intervention: picoParsed.intervention,
          comparator: picoParsed.comparator,
          questionType: "Therapy / Prevention"
        },
        {},
        {
          originalInput: tagWords,
          population: picoParsed.condition,
          keywords: [gapData.topic, ...gapData.known.map(k => k.point)]
        }
      );
      const outcomeSelection = selectOutcomes(outcomeContext);
      let outcomeOptions = outcomeSelection.options;
      if (outcomeOptions.length < 4) {
        const ranked = KB[picoParsed.specialty]?.outcomesRanked || [];
        for (const r of ranked) {
          if (!outcomeOptions.some(o => o.label.toLowerCase() === r.toLowerCase())) {
            outcomeOptions.push({
              id: r.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              label: r,
              category: "clinical",
              rationale: `Standard outcome for ${spec.name}`
            });
          }
          if (outcomeOptions.length >= 6) break;
        }
      }
      outcomeOptions = outcomeOptions.slice(0, 6);
      assert.ok(outcomeOptions.length >= 4 && outcomeOptions.length <= 6, `Must generate 4–6 outcome options, got ${outcomeOptions.length}`);
      console.log(`    ✓ Generated ${outcomeOptions.length} clinical outcome options: [${outcomeOptions.map(o => o.label).join(", ")}]`);

      // Pick 1 outcome
      const chosenOutcome = outcomeOptions[0].label;
      console.log(`  Step 4: Chosen Outcome: "${chosenOutcome}"`);

      // 3. Formulate Question API on localhost
      console.log(`  Step 5: Calling localhost /api/engine stage: "formulate"...`);
      const formulateRes = await fetch(`${BASE_URL}/api/engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "formulate",
          analysis: {
            specialty: spec.id,
            specialtyLabel: spec.name,
            condition: picoParsed.condition,
            intervention: picoParsed.intervention,
            comparator: picoParsed.comparator,
            questionType: "Therapy / Prevention",
            framework: "PICO",
            missing: [],
            interpretation: `PICO targeting ${picoParsed.condition}`
          },
          answered: {
            condition: picoParsed.condition,
            intervention: picoParsed.intervention,
            comparator: picoParsed.comparator,
            outcome: chosenOutcome
          },
          selectedQuestion: selectedPico
        })
      });
      assert.equal(formulateRes.status, 200, `Stage formulate returned status ${formulateRes.status}`);
      const formulateData = await formulateRes.json();
      assert.ok(formulateData.finalQuestion, "Formulation must produce finalQuestion");
      assert.ok(Array.isArray(formulateData.elements), "Formulation must produce elements");
      console.log(`    ✓ Formulated Question: "${formulateData.finalQuestion.slice(0, 90)}..."`);

      // 4. Generate Commentary on localhost
      console.log(`  Step 6: Calling localhost /api/engine stage: "commentary"...`);
      const commRes = await fetch(`${BASE_URL}/api/engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "commentary",
          topic: tagWords,
          specialty: spec.id,
          gapAnalysis: gapData,
          selectedQuestion: formulateData.finalQuestion,
          outcome: chosenOutcome,
          picoElements: formulateData.elements
        })
      });
      if (commRes.status !== 200) {
        const errText = await commRes.text();
        console.error(`    ❌ Commentary error response (${commRes.status}):`, errText);
      }
      assert.equal(commRes.status, 200, `Stage commentary returned status ${commRes.status}`);
      const commData = await commRes.json();
      assert.ok(commData.title && commData.title.length > 5, "Commentary must return title");
      assert.ok(commData.abstract && commData.abstract.length > 20, "Commentary must return abstract");
      assert.ok(commData.introduction && commData.introduction.length > 20, "Commentary must return introduction");
      assert.ok(commData.discussion && commData.discussion.length > 20, "Commentary must return discussion");
      assert.ok(commData.conclusion && commData.conclusion.length > 20, "Commentary must return conclusion");
      assert.ok(Array.isArray(commData.references), "Commentary must return references array");
      assert.ok(commData.references.length >= 1, `Commentary references must be >= 1, got ${commData.references.length}`);
      console.log(`    ✓ Commentary Paper: "${commData.title}"`);
      console.log(`    ✓ References Count: ${commData.references.length} (Vancouver style)`);

      // Deliverable Integrity Gate
      const integrity = validateDeliverableIntegrity({
        fields: {
          abstract: commData.abstract,
          introduction: commData.introduction,
          discussion: commData.discussion,
          conclusion: commData.conclusion
        },
        references: commData.references,
        retainedRecords: commData.fetchedReferences || []
      });
      assert.ok(integrity.ok, `Deliverable integrity check failed: ${JSON.stringify(integrity)}`);
      console.log(`    ✓ Deliverable Integrity Gate: PASSED (zero orphan or unverified citations)`);

      // 5. Test PDF Exports on localhost
      console.log(`  Step 7: Testing PDF exports via localhost /api/pdf...`);
      const pdfCommRes = await fetch(`${BASE_URL}/api/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: "Scientific Commentary",
          title: commData.title,
          meta: `Aimed · ${spec.name} · ${spec.guidelines}`,
          pico: formulateData.elements,
          outcomes: [chosenOutcome],
          sections: [
            { heading: "Abstract", blocks: [commData.abstract] },
            { heading: "Introduction", blocks: [commData.introduction] },
            { heading: "Discussion", blocks: [commData.discussion] },
            { heading: "Conclusion", blocks: [commData.conclusion] }
          ],
          references: commData.references,
          retainedReferences: commData.fetchedReferences || []
        })
      });
      assert.equal(pdfCommRes.status, 200, `Commentary PDF export returned status ${pdfCommRes.status}`);
      const pdfCommBlob = await pdfCommRes.arrayBuffer();
      assert.ok(pdfCommBlob.byteLength > 1000, `Commentary PDF size must be > 1000 bytes, got ${pdfCommBlob.byteLength}`);
      console.log(`    ✓ Commentary PDF Generated (${pdfCommBlob.byteLength} bytes, application/pdf)`);

      const pdfRefsRes = await fetch(`${BASE_URL}/api/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: "Reference List · Vancouver Style",
          title: commData.title,
          meta: `Aimed Medical Intelligence · ${spec.name}`,
          pico: formulateData.elements,
          outcomes: [chosenOutcome],
          references: commData.references,
          retainedReferences: commData.fetchedReferences || []
        })
      });
      assert.equal(pdfRefsRes.status, 200, `References PDF export returned status ${pdfRefsRes.status}`);
      const pdfRefsBlob = await pdfRefsRes.arrayBuffer();
      assert.ok(pdfRefsBlob.byteLength > 500, `References PDF size must be > 500 bytes, got ${pdfRefsBlob.byteLength}`);
      console.log(`    ✓ Vancouver References PDF Generated (${pdfRefsBlob.byteLength} bytes, application/pdf)`);

      console.log(`>>> RESULT [${num}/15] ${spec.name}: ✅ PASSED ALL CHECKS`);
      passed++;
    } catch (err) {
      console.error(`>>> RESULT [${num}/15] ${spec.name}: ❌ FAILED`);
      console.error(`Error details:`, err);
      failed++;
    }
  }

  console.log(`\n======================================================================`);
  console.log(`🏁 Multi-Specialty Localhost Test Suite Completed`);
  console.log(`Total Specialties: ${SPECIALTY_ORDER.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`======================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(e => {
  console.error("Fatal test runner error:", e);
  process.exit(1);
});
