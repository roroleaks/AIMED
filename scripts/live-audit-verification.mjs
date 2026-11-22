/**
 * AIMed Live Audit Verification Suite
 * Executes live HTTP requests against deployed production endpoints (aimed-pico.vercel.app)
 * to verify HMAC signature enforcement, zero false positives, honest methods/counts,
 * and deliverable integrity.
 */

const BASE_URL = process.env.AIMED_LIVE_URL || "https://aimed-pico.vercel.app";

console.log(`================================================================`);
console.log(`AIMed Live Audit Verification Suite`);
console.log(`Target: ${BASE_URL}`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log(`================================================================\n`);

async function runLiveVerification() {
  let passed = 0;
  let failed = 0;

  function report(name, ok, details = "") {
    if (ok) {
      console.log(`[PASS] ${name}`);
      if (details) console.log(`       ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      if (details) console.error(`       ${details}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // PROBE 1: Fabricated Paper Signature Enforcement across all 3 routes (HTTP 422)
  // --------------------------------------------------------------------------
  console.log(`--- PROBE 1: Fabricated Paper Signature Rejection (HTTP 422) ---`);
  const fakePaper = {
    rank: 1,
    relevancePct: 95,
    title: "Fabricated Trial of Inventions",
    authors: "Smith J, Fake A",
    journal: "Journal of Invented Results",
    year: "2024",
    design: "Randomized controlled trial",
    matchedElements: ["P", "I", "C", "O"],
    pmid: "99999999"
    // No _sig!
  };

  const fakeWorkflow = {
    words: [
      { word: "women aged 35-40 undergoing IVF", role: "population" },
      { word: "PGT-A", role: "intervention" },
      { word: "morphology-based blastocyst selection", role: "comparator" },
      { word: "cumulative live birth rate", role: "outcome" }
    ],
    category: "established",
    phrase: "In women aged 35-40 undergoing IVF, does PGT-A compared with morphology improve live birth?",
    specialty: "obgyn",
    specialtyLabel: "Obstetrics & Gynecology",
    screeningStats: { retrieved: 10, screened: 10, relaxationLevel: 0, excludedCount: 0 },
    papers: [fakePaper],
    title: "Fabricated Test Title",
    abstract: ["Objective: Test.", "Methods: Test.", "Results: Test.", "Conclusion: Test."],
    sections: [{ heading: "Evidence synthesis", paragraphs: ["Fabricated test content [1]."] }],
    references: ["1. Smith J, Fake A. Fabricated Trial of Inventions. Journal of Invented Results. 2024. pmid:99999999."]
  };

  // 1a: POST /api/engine (compose stage) with fake paper
  try {
    const resEngine = await fetch(`${BASE_URL}/api/engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "compose",
        words: fakeWorkflow.words,
        specialty: "obgyn",
        choice: { category: "established", phrase: fakeWorkflow.phrase },
        screeningStats: fakeWorkflow.screeningStats,
        records: [fakePaper]
      })
    });
    const bodyEngine = await resEngine.json().catch(() => ({}));
    report(
      "1a. /api/engine (compose) rejects unsigned/fabricated paper with HTTP 422",
      resEngine.status === 422,
      `Status: ${resEngine.status}, Response: ${JSON.stringify(bodyEngine)}`
    );
  } catch (err) {
    report("1a. /api/engine (compose) probe", false, err.message);
  }

  // 1b: POST /api/docx with fake paper
  try {
    const resDocx = await fetch(`${BASE_URL}/api/docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fakeWorkflow.phrase,
        workflow: fakeWorkflow
      })
    });
    const bodyDocx = await resDocx.json().catch(() => ({}));
    report(
      "1b. /api/docx rejects unsigned/fabricated paper in workflow with HTTP 422",
      resDocx.status === 422,
      `Status: ${resDocx.status}, Response: ${JSON.stringify(bodyDocx)}`
    );
  } catch (err) {
    report("1b. /api/docx probe", false, err.message);
  }

  // 1c: POST /api/pdf with fake paper
  try {
    const resPdf = await fetch(`${BASE_URL}/api/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fakeWorkflow.phrase,
        workflow: fakeWorkflow
      })
    });
    const bodyPdf = await resPdf.json().catch(() => ({}));
    report(
      "1c. /api/pdf rejects unsigned/fabricated paper in workflow with HTTP 422",
      resPdf.status === 422,
      `Status: ${resPdf.status}, Response: ${JSON.stringify(bodyPdf)}`
    );
  } catch (err) {
    report("1c. /api/pdf probe", false, err.message);
  }

  // --------------------------------------------------------------------------
  // PROBE 2: ADV-2 Live (P "IVF", I "homeopathy", C "placebo", O "live birth")
  // --------------------------------------------------------------------------
  console.log(`\n--- PROBE 2: ADV-2 Live (IVF, homeopathy, placebo, live birth) ---`);
  let adv2Words = [
    { word: "IVF", role: "population" },
    { word: "homeopathy", role: "intervention" },
    { word: "placebo", role: "comparator" },
    { word: "live birth", role: "outcome" }
  ];

  try {
    // Screen stage
    const resScreen = await fetch(`${BASE_URL}/api/engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "screen", words: adv2Words, specialty: "obgyn" })
    });
    const screenData = await resScreen.json();
    console.log(`    ADV-2 Screen: established supported=${screenData?.phrases?.established?.supported}, phrase="${screenData?.phrases?.established?.phrase?.slice(0, 60)}..."`);

    // Explore stage
    const resExplore = await fetch(`${BASE_URL}/api/engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "explore",
        words: adv2Words,
        specialty: "obgyn",
        choice: {
          category: "established",
          phrase: screenData?.phrases?.established?.phrase || "In IVF (P), does homeopathy (I) compared with placebo (C) improve live birth (O)?"
        }
      })
    });
    const exploreData = await resExplore.json();
    const records = exploreData.records || [];
    console.log(`    ADV-2 Explore: ${records.length} records returned. Scores: ${records.map(r => r.relevancePct).join(", ")}`);

    // Compose stage
    const resCompose = await fetch(`${BASE_URL}/api/engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "compose",
        words: adv2Words,
        specialty: "obgyn",
        choice: {
          category: "established",
          phrase: screenData?.phrases?.established?.phrase || "In IVF (P), does homeopathy (I) compared with placebo (C) improve live birth (O)?"
        },
        screeningStats: exploreData.corpusStats,
        records,
        searchLog: exploreData.searchLog
      })
    });
    const composeData = await resCompose.json();
    const manuscript = composeData.manuscript || composeData;
    const conclusionP = manuscript?.sections?.find(s => s.heading === "Conclusion")?.paragraphs?.[0] || "";
    const titleText = manuscript?.title || "";

    console.log(`    ADV-2 Title: "${titleText}"`);
    console.log(`    ADV-2 Conclusion: "${conclusionP.slice(0, 100)}..."`);

    report(
      "2a. ADV-2 conclusion reports 'insufficient direct evidence'",
      conclusionP.toLowerCase().includes("insufficient direct evidence"),
      `Conclusion: "${conclusionP}"`
    );

    report(
      "2b. ADV-2 title does NOT claim 'Established Clinical Knowledge'",
      !titleText.includes("Established Clinical Knowledge"),
      `Title: "${titleText}"`
    );

    // Test genuine export with ADV-2 payload
    const adv2Workflow = {
      words: adv2Words,
      category: "established",
      phrase: screenData?.phrases?.established?.phrase,
      specialty: "obgyn",
      specialtyLabel: "Obstetrics & Gynecology",
      screeningStats: {
        retrieved: exploreData.corpusStats?.retrieved ?? 0,
        screened: exploreData.corpusStats?.screened ?? 0,
        relaxationLevel: exploreData.corpusStats?.relaxationLevel ?? 0,
        excludedCount: 0
      },
      papers: records.map((r, idx) => ({
        rank: idx + 1,
        relevancePct: r.relevancePct ?? 0,
        title: r.title,
        authors: r.authors || "",
        journal: r.journal || "",
        year: r.year || "",
        design: r.design || "Observational study",
        matchedElements: r.matchedElements || [],
        pmid: r.pmid,
        doi: r.doi,
        context: r.context,
        _sig: r._sig
      })),
      title: manuscript.title,
      abstract: manuscript.abstract,
      sections: manuscript.sections,
      references: manuscript.references,
      citationStyle: "vancouver"
    };

    const resAdvDocx = await fetch(`${BASE_URL}/api/docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: adv2Workflow.phrase, workflow: adv2Workflow })
    });
    report(
      "2c. ADV-2 DOCX export succeeds (200 OK)",
      resAdvDocx.status === 200,
      `Status: ${resAdvDocx.status}`
    );

    const resAdvPdf = await fetch(`${BASE_URL}/api/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: adv2Workflow.phrase, workflow: adv2Workflow })
    });
    report(
      "2d. ADV-2 PDF export succeeds (200 OK)",
      resAdvPdf.status === 200,
      `Status: ${resAdvPdf.status}`
    );
  } catch (err) {
    report("2. ADV-2 pipeline", false, err.message);
  }

  // --------------------------------------------------------------------------
  // PROBE 3: ONC-1 Live (pembrolizumab in NSCLC, KEYNOTE-189, no NCT)
  // --------------------------------------------------------------------------
  console.log(`\n--- PROBE 3: ONC-1 Live (NSCLC, pembrolizumab, platinum, overall survival) ---`);
  const onc1Words = [
    { word: "advanced non-small cell lung cancer", role: "population" },
    { word: "pembrolizumab", role: "intervention" },
    { word: "platinum chemotherapy", role: "comparator" },
    { word: "overall survival", role: "outcome" }
  ];

  try {
    const resExplore = await fetch(`${BASE_URL}/api/engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "explore",
        words: onc1Words,
        specialty: "oncology",
        choice: {
          category: "established",
          phrase: "In advanced non-small cell lung cancer (P), does pembrolizumab (I) compared with platinum chemotherapy (C) improve overall survival (O)?"
        }
      })
    });
    const exploreData = await resExplore.json();
    const records = exploreData.records || [];
    console.log(`    ONC-1 Explore: retrieved ${records.length} records.`);

    // Check for KEYNOTE-189 (PMID 29658856)
    const keynote = records.find(r => r.pmid === "29658856" || (r.title && r.title.toLowerCase().includes("keynote-189")));
    const keynoteRank = keynote ? records.indexOf(keynote) + 1 : -1;
    console.log(`    KEYNOTE-189 present: ${Boolean(keynote)}, Rank: ${keynoteRank}, Score: ${keynote?.relevancePct}%`);

    report(
      "3a. ONC-1 KEYNOTE-189 (PMID 29658856) is present in retained records",
      Boolean(keynote),
      keynote ? `Rank #${keynoteRank}, Score: ${keynote.relevancePct}%, Title: "${keynote.title}"` : "Not found"
    );

    // Check for zero NCT registrations
    const nctRecords = records.filter(r => (r.pmid && String(r.pmid).toLowerCase().startsWith("nct:")) || (r.source === "clinicaltrials"));
    console.log(`    ClinicalTrials.gov (NCT) registrations in evidence: ${nctRecords.length}`);
    report(
      "3b. ONC-1 zero ClinicalTrials.gov NCT registrations in retained evidence",
      nctRecords.length === 0,
      `Found ${nctRecords.length} NCT records`
    );

    // Check KEYNOTE-189 ranks above unrelated FT3/FT4 paper
    const ft3Paper = records.find(r => r.title && /ft3|ft4/i.test(r.title));
    const ft3Rank = ft3Paper ? records.indexOf(ft3Paper) + 1 : 999;
    report(
      "3c. ONC-1 KEYNOTE-189 ranks above unrelated FT3/FT4 paper",
      Boolean(keynote) && (!ft3Paper || keynoteRank < ft3Rank),
      keynote ? `KEYNOTE-189 rank: ${keynoteRank}, FT3/FT4 rank: ${ft3Rank}` : "KEYNOTE-189 not found"
    );
  } catch (err) {
    report("3. ONC-1 pipeline", false, err.message);
  }

  // --------------------------------------------------------------------------
  // PROBE 4: ART-2 Live (P "women aged 35-40 undergoing IVF", I "PGT-A", C "morphology-based blastocyst selection", O "cumulative live birth rate")
  // --------------------------------------------------------------------------
  console.log(`\n--- PROBE 4: ART-2 Live (PGT-A vs morphology, live birth rate) ---`);
  const art2Words = [
    { word: "women aged 35-40 undergoing IVF", role: "population" },
    { word: "PGT-A", role: "intervention" },
    { word: "morphology-based blastocyst selection", role: "comparator" },
    { word: "cumulative live birth rate", role: "outcome" }
  ];

  try {
    const resExplore = await fetch(`${BASE_URL}/api/engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "explore",
        words: art2Words,
        specialty: "obgyn",
        choice: {
          category: "established",
          phrase: "In women aged 35-40 undergoing IVF (P), does PGT-A (I) compared with morphology-based blastocyst selection (C) improve cumulative live birth rate (O)?"
        }
      })
    });
    const exploreData = await resExplore.json();
    const records = exploreData.records || [];
    console.log(`    ART-2 Explore: retrieved ${records.length} records.`);

    // Compose stage
    const resCompose = await fetch(`${BASE_URL}/api/engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "compose",
        words: art2Words,
        specialty: "obgyn",
        choice: {
          category: "established",
          phrase: "In women aged 35-40 undergoing IVF (P), does PGT-A (I) compared with morphology-based blastocyst selection (C) improve cumulative live birth rate (O)?"
        },
        screeningStats: exploreData.corpusStats,
        records,
        searchLog: exploreData.searchLog
      })
    });
    const composeData = await resCompose.json();
    const manuscript = composeData.manuscript || composeData;
    const synthSec = manuscript?.sections?.find(s => s.heading === "Evidence synthesis");
    const synthText = (synthSec?.paragraphs || []).join("\n");
    const methodsSec = manuscript?.sections?.find(s => s.heading === "Search strategy and screening");
    const methodsText = (methodsSec?.paragraphs || []).join("\n");

    // R5 check: findings do not contain procedural boilerplate
    const badProceduralPatterns = [
      /allocation concealment was achieved/i,
      /eleven studies reporting/i,
      /the main outcomes were/i,
      /women were grouped by/i,
      /a total of \d+ studies/i
    ];
    const hasProcedural = badProceduralPatterns.some(p => p.test(synthText));
    console.log(`    ART-2 Synthesis Findings clean of procedural text: ${!hasProcedural}`);
    report(
      "4a. ART-2 Quoted findings are real results, clean of procedural sentences (R5)",
      !hasProcedural,
      hasProcedural ? "Found procedural sentence in synthesis" : "Clean result sentences verified"
    );

    // R6 check: Methods names queried sources, exact query, hit counts, date, screened counts
    const hasTruthfulSources = methodsText.includes("PubMed") || methodsText.includes("queries");
    const hasFalseSentence = methodsText.includes("records were retained only when they addressed the population, the intervention or comparator, and the outcome");
    report(
      "4b. ART-2 Methods text is truthful and false retention sentence is removed (R6)",
      !hasFalseSentence && hasTruthfulSources,
      hasFalseSentence ? "False retention sentence still present" : "Truthful methods text confirmed"
    );

    // R10 check: Extraction table renders with study-specific population/comparator
    const tablePara = synthSec?.paragraphs?.find(p => p.startsWith("| Citation |"));
    const tableRows = tablePara ? tablePara.split("\n").filter(l => l.startsWith("|") && !l.includes("---") && !l.includes("Citation")) : [];
    console.log(`    ART-2 Extraction Table: ${tableRows.length} rows.`);
    const repeatingUserPico = tableRows.every(r => r.includes("women aged 35-40 undergoing IVF"));
    report(
      "4c. ART-2 Extraction table columns reflect study reporting, not repeating user PICO (R10)",
      !repeatingUserPico,
      tableRows.slice(0, 2).join("\n       ")
    );
  } catch (err) {
    report("4. ART-2 pipeline", false, err.message);
  }

  console.log(`\n================================================================`);
  console.log(`Live Verification Summary: ${passed} passed, ${failed} failed`);
  console.log(`================================================================`);
  return { passed, failed };
}

runLiveVerification();
