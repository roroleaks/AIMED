import assert from "node:assert/strict";
import { SPECIALTIES } from "../src/lib/specialties.ts";
import { generateDeterministicScreen } from "../src/lib/deterministic-screen.ts";
import { assignPicoRoles } from "../src/lib/pico-roles.ts";
import { scoreRecords } from "../src/lib/explore-scoring.ts";
import { composeManuscript } from "../src/lib/manuscript-composer.ts";
import { buildSummaryPayload } from "../src/lib/summary-payload.ts";
import { buildWorkflowDocx } from "../src/lib/docx-generator.ts";
import { buildWorkflowPdf } from "../src/lib/pdf-generator.ts";
import { validateDeliverableIntegrity } from "../src/lib/deliverable-integrity.ts";

const BASE_URL = process.env.AIMED_BASE_URL || "http://localhost:3000";

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

const args = process.argv.slice(2);
const isOffline = args.includes("--offline");
const specIndex = args.indexOf("--specialty");
const specialtyFilter = specIndex !== -1 && args[specIndex + 1] ? args[specIndex + 1].toLowerCase().trim() : null;

const targetSpecialties = specialtyFilter
  ? SPECIALTY_ORDER.filter(s => s.id === specialtyFilter)
  : SPECIALTY_ORDER;

if (specialtyFilter && targetSpecialties.length === 0) {
  console.error(`Unknown specialty: "${specialtyFilter}". Available: ${SPECIALTY_ORDER.map(s => s.id).join(", ")}`);
  process.exit(1);
}

async function runTest() {
  console.log(`======================================================================`);
  console.log(`🔬 AIMed Multi-Specialty Verification Suite (${targetSpecialties.length} Specialties)`);
  console.log(`Mode: ${isOffline ? "Offline (Deterministic Pipeline Verification)" : `Live (${BASE_URL})`}`);
  console.log(`======================================================================\n`);

  let passed = 0;
  let failed = 0;

  for (let idx = 0; idx < targetSpecialties.length; idx++) {
    const spec = targetSpecialties[idx];
    const num = idx + 1;
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`[${num}/${targetSpecialties.length}] Testing: ${spec.name} (${spec.guidelines})`);
    console.log(`Specialty Key: "${spec.id}"`);
    console.log(`----------------------------------------------------------------------`);

    try {
      // 1. Definition and Preset Verification
      const def = SPECIALTIES[spec.id];
      assert.ok(def, `Specialty definition for ${spec.id} must exist`);
      assert.equal(def.authorityGuidelines, spec.guidelines, `Guidelines must match exact specification`);

      const preset = def.presets[0];
      assert.ok(preset, `At least 1 preset must exist for ${spec.id}`);
      const rawWords = preset.raw.split(",").map(w => w.trim()).filter(Boolean);
      assert.ok(rawWords.length >= 3 && rawWords.length <= 5, `Preset raw keywords must be 3-5, got ${rawWords.length}`);
      const picoWords = assignPicoRoles(rawWords, spec.id);
      console.log(`  Step 1: Intake & Roles -> ${picoWords.map(w => `${w.role}:"${w.word}"`).join(", ")}`);

      const popWord = picoWords.find(w => w.role === "population")?.word || "";
      const intWord = picoWords.find(w => w.role === "intervention")?.word || "";
      const compWord = picoWords.find(w => w.role === "comparator")?.word || "";
      const outWord = picoWords.find(w => w.role === "outcome")?.word || "";

      const fixtureRecords = [
        {
          pmid: `31000${String(num).padStart(3, "0")}1`,
          title: `Randomized trial of ${intWord} versus ${compWord || "standard"} in ${popWord}`,
          authors: "Smith J, Anderson K, Miller P",
          year: "2023",
          journal: "N Engl J Med",
          doi: `10.1056/nejmoa2300${String(num).padStart(3, "0")}1`,
          pubType: "Randomized Controlled Trial",
          context: `In patients with ${popWord}, ${intWord} significantly improved ${outWord} compared to ${compWord || "control"}. Conclusion: ${intWord} is effective for ${outWord}.`
        },
        {
          pmid: `31000${String(num).padStart(3, "0")}2`,
          title: `Prospective cohort study of ${intWord} on ${outWord} in ${popWord}`,
          authors: "Johnson AB, Davis CL",
          year: "2022",
          journal: "Lancet",
          doi: `10.1016/s0140-6736(22)00${String(num).padStart(3, "0")}2`,
          pubType: "Comparative Study",
          context: `This prospective investigation evaluated ${intWord} and observed favorable associations with ${outWord} among ${popWord}.`
        }
      ];

      // 2. Step 2 Screening
      const screenResult = generateDeterministicScreen(picoWords, fixtureRecords);
      assert.ok(screenResult.phrases.established, "Must return established evidence category");
      assert.ok(screenResult.phrases.conflicting, "Must return conflicting evidence category");
      assert.ok(screenResult.phrases.gap, "Must return gap evidence category");
      assert.ok(!screenResult.phrases.established.phrase.includes("[comparator not specified]") || !picoWords.some(w => w.role === "comparator"), "Comparator must not be default bracketed when present");
      console.log(`  Step 2: Screening -> established, conflicting, and gap categories verified`);

      // 3. Step 3 Explore (Scoring with fixture records)
      const chosenCategory = "established";
      const chosenPhrase = screenResult.phrases[chosenCategory].phrase;

      const scored = scoreRecords(fixtureRecords, chosenPhrase, chosenCategory, []);
      assert.ok(scored.scored.length >= 1, "At least 1 record scored");
      assert.ok(scored.scored[0].relevancePct >= 15, "Top record meets relevance threshold");
      console.log(`  Step 3: Explore -> Scored ${scored.scored.length} records (Top: ${scored.scored[0].relevancePct}%)`);

      // 4. Step 4 Manuscript Composition
      const choice = {
        category: chosenCategory,
        phrase: chosenPhrase
      };
      const screeningStats = {
        retrieved: 2,
        screened: 2,
        relaxationLevel: 0,
        excludedCount: 0
      };

      const manuscript = composeManuscript({
        words: picoWords,
        category: chosenCategory,
        phrase: chosenPhrase,
        screeningStats,
        records: scored.scored,
        specialty: spec.id,
        style: "vancouver"
      });

      assert.equal(manuscript.sections.length, 5, "Manuscript must have 5 structured sections");
      assert.ok(manuscript.abstract.length >= 2, "Abstract must have at least 2 sentences");
      assert.ok(manuscript.references.length >= 1, "Must have references");
      const conclusionSec = manuscript.sections.find(s => s.heading === "Conclusion");
      assert.ok(conclusionSec && conclusionSec.paragraphs.length >= 1, "Must have conclusion section");
      assert.ok(conclusionSec.paragraphs[0].length > 10, "Conclusion paragraph must be derived and non-empty");
      console.log(`  Step 4: Compose -> 5 IMRaD sections, ${manuscript.references.length} references, evidence derived`);

      // 5. Deliverable Integrity Gate
      const narrativeFields = {
        abstract: manuscript.abstract.join(" "),
        ...Object.fromEntries(manuscript.sections.map(s => [s.heading.toLowerCase(), s.paragraphs.join(" ")]))
      };
      const integrity = validateDeliverableIntegrity({
        fields: narrativeFields,
        references: manuscript.references,
        retainedRecords: scored.scored,
        exportReferences: manuscript.references
      });
      assert.ok(integrity.ok, `Integrity gate failed: ${JSON.stringify(integrity)}`);
      console.log(`    ✓ Deliverable Integrity Gate: PASSED (zero orphan or unverified citations)`);

      // 6. Exports Generation (DOCX and PDF)
      const summaryPayload = buildSummaryPayload(
        picoWords,
        choice,
        { phrases: screenResult.phrases },
        { records: scored.scored },
        { userExcluded: [], seen: [] },
        manuscript,
        spec.id
      );

      const docxBuffer = await buildWorkflowDocx(summaryPayload);
      assert.ok(docxBuffer.byteLength > 1000, `DOCX buffer must be > 1000 bytes, got ${docxBuffer.byteLength}`);
      console.log(`    ✓ Workflow DOCX Generated (${docxBuffer.byteLength} bytes)`);

      const pdfBuffer = await buildWorkflowPdf(summaryPayload);
      assert.ok(pdfBuffer.byteLength > 1000, `PDF buffer must be > 1000 bytes, got ${pdfBuffer.byteLength}`);
      console.log(`    ✓ Workflow PDF Generated (${pdfBuffer.byteLength} bytes)`);

      // 7. Live mode API test if not offline
      if (!isOffline) {
        console.log(`  Step 7: Verifying live localhost API endpoints...`);
        const screenRes = await fetch(`${BASE_URL}/api/engine`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: "screen",
            words: picoWords,
            specialty: spec.id
          })
        });
        assert.equal(screenRes.status, 200, `Live screen status ${screenRes.status}`);
        console.log(`    ✓ Live API screen stage passed`);
      }

      console.log(`>>> RESULT [${num}/${targetSpecialties.length}] ${spec.name}: ✅ PASSED ALL CHECKS`);
      passed++;
    } catch (err) {
      console.error(`>>> RESULT [${num}/${targetSpecialties.length}] ${spec.name}: ❌ FAILED`);
      console.error(`Error details:`, err);
      failed++;
    }
  }

  console.log(`\n======================================================================`);
  console.log(`🏁 Multi-Specialty Test Suite Completed`);
  console.log(`Total Specialties: ${targetSpecialties.length}`);
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
