import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { buildWorkflowDocx } from "./docx-generator.ts";
import { buildWorkflowPdf } from "./pdf-generator.ts";
import { composeManuscript } from "./manuscript-composer.ts";
import type { WorkflowExportData } from "./summary-payload.ts";
import type { ExploreRecord } from "./explore-scoring.ts";

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

  // Map font ID (/F1, /F2, etc.) to font object number
  const fontObjMap = new Map<string, string>();
  for (const fm of str.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
    for (const entry of fm[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      fontObjMap.set(entry[1], entry[2]);
    }
  }

  // Map font object number to ToUnicode CMap object number
  const cmapObjMap = new Map<string, string>();
  for (const [fontName, fontObjId] of fontObjMap) {
    const objHeader = `${fontObjId} 0 obj`;
    const objIdx = str.indexOf(objHeader);
    if (objIdx !== -1) {
      const objBody = str.slice(objIdx, objIdx + 500);
      const toUnicodeMatch = objBody.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (toUnicodeMatch) {
        cmapObjMap.set(fontName, toUnicodeMatch[1]);
      }
    }
  }

  // Parse each CMap
  const fontCmaps = new Map<string, Map<number, string>>();
  for (const [fontName, cmapObjId] of cmapObjMap) {
    const objHeader = `${cmapObjId} 0 obj`;
    const cIdx = str.indexOf(objHeader);
    if (cIdx === -1) continue;
    const streamStart = str.indexOf("stream", cIdx);
    const streamEnd = str.indexOf("endstream", streamStart);
    const cMapData = str.slice(streamStart, streamEnd);
    const charMap = new Map<number, string>();

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

  // Decode text streams
  let fullText = "";
  let currentFont = "";
  for (const line of str.split("\n")) {
    const fontSwitch = line.match(/\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf/);
    if (fontSwitch) {
      currentFont = fontSwitch[1];
    }
    if (line.includes("TJ")) {
      const charMap = fontCmaps.get(currentFont) || new Map<number, string>();
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

const sampleRecords: ExploreRecord[] = [
  {
    title: "Cervical cerclage for prevention of preterm birth in singleton pregnancies",
    authors: "Berghella V, Odibo AO, Tolosa JE",
    journal: "Obstet Gynecol",
    year: "2021",
    pmid: "32000001",
    doi: "10.1097/AOG.0000000000004123",
    relevancePct: 94,
    matchedElements: ["P", "I", "C", "O"]
  },
  {
    title: "Expectant management in cervical shortening",
    authors: "Smith R, Jones K",
    journal: "Am J Obstet Gynecol",
    year: "2020",
    pmid: "32000002",
    doi: "10.1016/j.ajog.2020.05.011",
    relevancePct: 78,
    matchedElements: ["P", "C", "O"]
  }
];

function buildSampleWorkflow(style: "vancouver" | "apa" | "harvard"): WorkflowExportData {
  const manuscript = composeManuscript({
    words: [
      { word: "cervical insufficiency", role: "population" },
      { word: "cerclage", role: "intervention" },
      { word: "expectant management", role: "comparator" },
      { word: "preterm birth", role: "outcome" }
    ],
    category: "conflicting",
    phrase: "In cervical insufficiency (P), does cerclage (I) compared with expectant management (C) reduce preterm birth (O)?",
    screeningStats: {
      retrieved: 50,
      screened: 50,
      relaxationLevel: 0,
      excludedCount: 1
    },
    records: sampleRecords,
    userExcluded: [],
    specialty: "obgyn",
    style
  });

  return {
    words: [
      { word: "cervical insufficiency", role: "population" },
      { word: "cerclage", role: "intervention" },
      { word: "expectant management", role: "comparator" },
      { word: "preterm birth", role: "outcome" }
    ],
    category: "conflicting",
    phrase: "In cervical insufficiency (P), does cerclage (I) compared with expectant management (C) reduce preterm birth (O)?",
    specialty: "obgyn",
    specialtyLabel: "Obstetrics & Gynecology",
    screeningStats: {
      retrieved: 50,
      screened: 50,
      relaxationLevel: 0,
      excludedCount: 1
    },
    papers: [
      {
        rank: 1,
        relevancePct: 94,
        title: "Cervical cerclage for prevention of preterm birth in singleton pregnancies",
        authors: "Berghella V, Odibo AO, Tolosa JE",
        journal: "Obstet Gynecol",
        year: "2021",
        design: "Randomized controlled trial",
        matchedElements: ["Population", "Intervention", "Comparator", "Outcome"]
      }
    ],
    title: manuscript.title,
    abstract: manuscript.abstract,
    sections: manuscript.sections,
    references: manuscript.references,
    citationStyle: style,
    aiEnriched: false
  };
}

test("WE1. buildWorkflowDocx generates valid DOCX with title, citations, references, and ZERO http occurrences", async () => {
  for (const style of ["vancouver", "apa", "harvard"] as const) {
    const workflow = buildSampleWorkflow(style);
    const buf = await buildWorkflowDocx(workflow);

    assert.ok(buf.length > 5000, `DOCX buffer must exceed 5KB, got ${buf.length}`);
    // Check PK zip signature
    assert.equal(buf.subarray(0, 4).toString("hex"), "504b0304", "DOCX must start with PK signature");

    const text = extractDocxText(buf);
    assert.ok(text.includes("Cervical cerclage"), `DOCX in ${style} must include title text`);
    assert.ok(!text.includes("http:"), `DOCX in ${style} must have zero http occurrences`);
    assert.ok(!text.includes("https:"), `DOCX in ${style} must have zero https occurrences`);

    if (style === "vancouver") {
      assert.ok(text.includes("[1]"), "Vancouver DOCX must include in-text citation [1]");
      assert.ok(text.includes("1. Berghella V, Odibo AO, Tolosa JE."), "Vancouver reference line formatted");
    } else if (style === "apa") {
      assert.ok(text.includes("Berghella et al., 2021"), "APA DOCX must include author-year citation");
      assert.ok(text.includes("Berghella, V., Odibo, A.O., & Tolosa, J.E. (2021)."), "APA reference line formatted");
    } else if (style === "harvard") {
      assert.ok(text.includes("Berghella et al. 2021"), "Harvard DOCX must include author-year citation");
      assert.ok(text.includes("Berghella, V., Odibo, A.O. and Tolosa, J.E., 2021."), "Harvard reference line formatted");
    }
  }
});

test("WE2. buildWorkflowPdf generates valid PDF with %PDF signature, citations, references, and ZERO http occurrences", async () => {
  for (const style of ["vancouver", "apa", "harvard"] as const) {
    const workflow = buildSampleWorkflow(style);
    const buf = await buildWorkflowPdf(workflow);

    assert.ok(buf.length > 5000, `PDF buffer must exceed 5KB, got ${buf.length}`);
    // Check %PDF signature
    assert.equal(buf.subarray(0, 4).toString("utf8"), "%PDF", "PDF must start with %PDF");

    const text = extractPdfText(buf);
    assert.ok(text.includes("Cervical cerclage"), `PDF in ${style} must include title text`);
    assert.ok(!text.includes("http:"), `PDF in ${style} must have zero http occurrences`);
    assert.ok(!text.includes("https:"), `PDF in ${style} must have zero https occurrences`);

    if (style === "vancouver") {
      assert.ok(text.includes("[1]"), "Vancouver PDF must include in-text citation [1]");
      assert.ok(text.includes("1. Berghella V, Odibo AO, Tolosa JE."), "Vancouver reference line formatted");
    } else if (style === "apa") {
      assert.ok(text.includes("Berghella et al., 2021"), "APA PDF must include author-year citation");
      assert.ok(text.includes("Berghella, V., Odibo, A.O., & Tolosa, J.E. (2021)."), "APA reference line formatted");
    } else if (style === "harvard") {
      assert.ok(text.includes("Berghella et al. 2021"), "Harvard PDF must include author-year citation");
      assert.ok(text.includes("Berghella, V., Odibo, A.O. and Tolosa, J.E., 2021."), "Harvard reference line formatted");
    }
  }
});
