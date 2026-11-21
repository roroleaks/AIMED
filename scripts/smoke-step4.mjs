import { generateDeterministicScreen } from "../src/lib/deterministic-screen.ts";
import { scoreRecords, filterExcludedRecords } from "../src/lib/explore-scoring.ts";
import { composeManuscript } from "../src/lib/manuscript-composer.ts";
import { buildSummaryPayload } from "../src/lib/summary-payload.ts";
import { buildWorkflowDocx } from "../src/lib/docx-generator.ts";
import { buildWorkflowPdf } from "../src/lib/pdf-generator.ts";
import zlib from "node:zlib";

function extractDocxText(buf) {
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
        return xml.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      }
      offset = dataOffset + compSize;
    } else {
      offset++;
    }
  }
  return "";
}

function extractPdfText(b) {
  const str = b.toString("latin1");
  const fontObjMap = new Map();
  for (const fm of str.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
    for (const entry of fm[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      fontObjMap.set(entry[1], entry[2]);
    }
  }
  const cmapObjMap = new Map();
  for (const [fontName, fontObjId] of fontObjMap) {
    const objHeader = fontObjId + " 0 obj";
    const objIdx = str.indexOf(objHeader);
    if (objIdx !== -1) {
      const objBody = str.slice(objIdx, objIdx + 500);
      const toUnicodeMatch = objBody.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (toUnicodeMatch) cmapObjMap.set(fontName, toUnicodeMatch[1]);
    }
  }
  const fontCmaps = new Map();
  for (const [fontName, cmapObjId] of cmapObjMap) {
    const objHeader = cmapObjId + " 0 obj";
    const cIdx = str.indexOf(objHeader);
    if (cIdx === -1) continue;
    const streamStart = str.indexOf("stream", cIdx);
    const streamEnd = str.indexOf("endstream", streamStart);
    const cMapData = str.slice(streamStart, streamEnd);
    const charMap = new Map();
    for (const rm of cMapData.matchAll(/<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>\s+\[([\s\S]*?)\]/g)) {
      const start = parseInt(rm[1], 16);
      const rawEntries = rm[3].match(/<([0-9a-fA-F\s]+)>/g) || [];
      rawEntries.forEach((rawEntry, i) => {
        const hex = rawEntry.replace(/[^0-9a-fA-F]/g, "");
        let decoded = "";
        for (let j = 0; j < hex.length; j += 4) {
          const code = parseInt(hex.slice(j, j + 4), 16);
          if (code > 0) decoded += String.fromCharCode(code);
        }
        if (decoded) charMap.set(start + i, decoded);
      });
    }
    fontCmaps.set(fontName, charMap);
  }
  let fullText = "";
  let currentFont = "";
  for (const line of str.split("\n")) {
    const fontSwitch = line.match(/\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf/);
    if (fontSwitch) currentFont = fontSwitch[1];
    if (line.includes("TJ")) {
      const charMap = fontCmaps.get(currentFont) || new Map();
      for (const hexGroup of line.matchAll(/<([0-9a-fA-F]+)>/g)) {
        const hex = hexGroup[1];
        for (let i = 0; i < hex.length; i += 4) {
          const cid = parseInt(hex.slice(i, i + 4), 16);
          fullText += charMap.get(cid) || "";
        }
      }
      fullText += " ";
    }
  }
  return fullText.replace(/\s+/g, " ");
}

async function runSmoke() {
  console.log("=== SMOKE WALKTHROUGH START ===");
  // 1. ObGyn Preset Words
  const words = [
    { word: "cervical insufficiency", role: "population" },
    { word: "cerclage", role: "intervention" },
    { word: "expectant management", role: "comparator" },
    { word: "preterm birth", role: "outcome" }
  ];
  console.log("Step 1 Words:", words.map(w => w.word).join(", "));

  // 2. Step 2 Screening
  const screen = generateDeterministicScreen(words);
  console.log("Step 2 Phrases generated:", Object.keys(screen.phrases));

  // 3. Choose Focus
  const choice = {
    category: "conflicting",
    phrase: screen.phrases.conflicting.phrase
  };
  console.log("Step 2 Choice:", choice.category, "->", choice.phrase);

  // 4. Mock explored corpus & scoring
  const mockCorpus = [
    {
      pmid: "3001",
      title: "Cervical cerclage compared with expectant management in cervical insufficiency for preterm birth",
      authors: "Berghella V, Odibo AO",
      journal: "Obstet Gynecol",
      year: "2021",
      doi: "10.1097/AOG.0000000000004123"
    },
    {
      pmid: "3002",
      title: "Expectant management outcomes in singleton pregnancy with shortened cervix",
      authors: "Smith R, Jones K",
      journal: "Am J Obstet Gynecol",
      year: "2020",
      doi: "10.1016/j.ajog.2020.05.011"
    },
    {
      pmid: "3003",
      title: "Observational cohort of cervical cerclage in high risk obstetrics",
      authors: "Alfirevic Z, Stampalija T",
      journal: "Cochrane Database Syst Rev",
      year: "2019",
      doi: "10.1002/14651858.CD008991"
    },
    {
      pmid: "3004",
      title: "Emergency cerclage in advanced cervical dilation",
      authors: "Stupin JH, David M",
      journal: "J Matern Fetal Neonatal Med",
      year: "2018",
      doi: "10.1080/14767058.2017.1344965"
    }
  ];

  const scored = scoreRecords(mockCorpus, choice.phrase, choice.category);
  console.log("Step 3 Explore: Scored", scored.scored.length, "records");

  // 5. Exclude 2 papers
  const userExcluded = ["p:3002", "p:3003"];
  const { surviving: retained } = filterExcludedRecords(scored.scored, userExcluded, []);
  console.log("Step 3 Exclude 2 papers: Retained", retained.length, "records (excluded pmid 3002, 3003)");

  // 6. Compose Step 4 Manuscript
  const stats = { retrieved: 50, screened: 50, relaxationLevel: 0, excludedCount: 2 };

  // Vancouver
  const vancouverDoc = composeManuscript({
    words, category: choice.category, phrase: choice.phrase,
    screeningStats: stats, records: retained, userExcluded, specialty: "obgyn", style: "vancouver"
  });
  console.log("\n--- SECTION HEADINGS IN ORDER ---");
  vancouverDoc.sections.forEach((s, idx) => console.log(`${idx + 1}. ${s.heading}`));

  console.log("\n--- VERBATIM REFERENCE PER STYLE ---");
  console.log("Vancouver Reference [1]:", vancouverDoc.references[0]);

  const apaDoc = composeManuscript({
    words, category: choice.category, phrase: choice.phrase,
    screeningStats: stats, records: retained, userExcluded, specialty: "obgyn", style: "apa"
  });
  console.log("APA Reference [1]:", apaDoc.references[0]);

  const harvardDoc = composeManuscript({
    words, category: choice.category, phrase: choice.phrase,
    screeningStats: stats, records: retained, userExcluded, specialty: "obgyn", style: "harvard"
  });
  console.log("Harvard Reference [1]:", harvardDoc.references[0]);

  // Export DOCX & PDF
  console.log("\n--- EXPORTS VERIFICATION ---");
  const vancouverPayload = buildSummaryPayload(words, choice, screen, { records: retained, corpusStats: { retrieved: 50, screened: 50, blocked: 0, returned: 2 }, hasMore: false }, { phrase: choice.phrase, category: choice.category, userExcluded, seen: [] }, vancouverDoc, "obgyn");
  const apaPayload = buildSummaryPayload(words, choice, screen, { records: retained, corpusStats: { retrieved: 50, screened: 50, blocked: 0, returned: 2 }, hasMore: false }, { phrase: choice.phrase, category: choice.category, userExcluded, seen: [] }, apaDoc, "obgyn");

  // DOCX Vancouver
  const docxVanBuf = await buildWorkflowDocx(vancouverPayload);
  const docxVanText = extractDocxText(docxVanBuf);
  console.log("DOCX Vancouver size:", docxVanBuf.length, "bytes, Zip Sig:", docxVanBuf.subarray(0, 4).toString("hex"), "contains title:", docxVanText.includes("Cervical cerclage"), "contains [1]:", docxVanText.includes("[1]"), "http occurrences:", (docxVanText.match(/https?:/g) || []).length);

  // DOCX APA
  const docxApaBuf = await buildWorkflowDocx(apaPayload);
  const docxApaText = extractDocxText(docxApaBuf);
  console.log("DOCX APA size:", docxApaBuf.length, "bytes, Zip Sig:", docxApaBuf.subarray(0, 4).toString("hex"), "contains title:", docxApaText.includes("Cervical cerclage"), "contains citation:", docxApaText.includes("Berghella & Odibo, 2021"), "http occurrences:", (docxApaText.match(/https?:/g) || []).length);

  // PDF Vancouver
  const pdfVanBuf = await buildWorkflowPdf(vancouverPayload);
  const pdfVanText = extractPdfText(pdfVanBuf);
  console.log("PDF Vancouver size:", pdfVanBuf.length, "bytes, %PDF Sig:", pdfVanBuf.subarray(0, 4).toString("utf8"), "contains title:", pdfVanText.includes("Cervical cerclage"), "contains [1]:", pdfVanText.includes("[1]"), "http occurrences:", (pdfVanBuf.toString("latin1").match(/https?:/g) || []).length);

  // PDF APA
  const pdfApaBuf = await buildWorkflowPdf(apaPayload);
  const pdfApaText = extractPdfText(pdfApaBuf);
  console.log("PDF APA size:", pdfApaBuf.length, "bytes, %PDF Sig:", pdfApaBuf.subarray(0, 4).toString("utf8"), "contains title:", pdfApaText.includes("Cervical cerclage"), "contains citation:", pdfApaText.includes("Berghella & Odibo, 2021"), "http occurrences:", (pdfApaBuf.toString("latin1").match(/https?:/g) || []).length);

  console.log("\n--- COMPOSE STAGE WITHOUT KEY & MARKER-FREE TITLE ---");
  console.log("aiEnriched:", vancouverDoc.aiEnriched, "deterministic draft intact:", vancouverDoc.sections.length === 5);
  console.log("Title verbatim:", vancouverDoc.title);
  console.log("Title marker-free check (has (P)/(I)/(C)/(O)?):", /\([PICO]\)/.test(vancouverDoc.title));

  // 7. Start Over (resetSession) verification
  console.log("\n--- START OVER (RESETSESSION) VERIFICATION ---");
  const { resetSession, KEYS } = await import("../src/lib/session.ts");
  const store = new Map();
  const mockStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  globalThis.window = { sessionStorage: mockStorage };

  // Plant active v4 keys, specialty, and legacy keys including aimed_citation_style
  store.set(KEYS.specialty, JSON.stringify("obgyn"));
  store.set(KEYS.picoWords, JSON.stringify(words));
  store.set(KEYS.choice, JSON.stringify(choice));
  store.set(KEYS.screen, JSON.stringify(screen));
  store.set(KEYS.explore, JSON.stringify(retained));
  store.set(KEYS.excluded, JSON.stringify({ userExcluded }));
  store.set(KEYS.style, JSON.stringify("vancouver"));
  store.set("cq_mode", "pubmed");
  store.set("cq_gap", "{}");
  store.set("cq_commentary", "{}");
  store.set("aimed_citation_style", "vancouver");

  console.log("Pre-reset storage items count:", store.size);
  resetSession();
  console.log("Post-reset storage items count:", store.size);
  console.log("aimed_specialty preserved:", store.get(KEYS.specialty) === JSON.stringify("obgyn"));
  console.log("cq_pico_words cleared:", store.get(KEYS.picoWords) === undefined);
  console.log("cq_choice cleared:", store.get(KEYS.choice) === undefined);
  console.log("cq_screen cleared:", store.get(KEYS.screen) === undefined);
  console.log("cq_explore cleared:", store.get(KEYS.explore) === undefined);
  console.log("cq_excluded cleared:", store.get(KEYS.excluded) === undefined);
  console.log("cq_style cleared:", store.get(KEYS.style) === undefined);
  console.log("Planted legacy aimed_citation_style purged:", store.get("aimed_citation_style") === undefined);
  console.log("Planted legacy cq_mode purged:", store.get("cq_mode") === undefined);

  delete globalThis.window;
  console.log("=== SMOKE WALKTHROUGH END ===");
}

runSmoke();
