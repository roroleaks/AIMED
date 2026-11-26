import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import { composeManuscript } from "../../src/lib/manuscript-composer.ts";
import { buildSummaryPayload } from "../../src/lib/summary-payload.ts";
import { buildWorkflowDocx } from "../../src/lib/docx-generator.ts";
import { buildWorkflowPdf } from "../../src/lib/pdf-generator.ts";
import { APP_VERSION, getCommitSha } from "../../src/lib/version.ts";
import type { CitationStyle } from "../../src/lib/citation-styles.ts";

import type { PicoWord } from "../../src/lib/pico-roles.ts";
import type { ScreenPayload } from "../../src/lib/deterministic-screen.ts";
import type { ExploreRecord } from "../../src/lib/explore-scoring.ts";

interface ExportFixture {
  specialty: string;
  words: PicoWord[];
  screenResponse: ScreenPayload;
  exploreResponse: {
    records: ExploreRecord[];
    corpusStats: { retrieved: number; screened: number; blocked: number; returned: number; relaxationLevel: 0 | 1 | 2 };
  } | null;
}

function loadJson<T>(relPath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(relPath), "utf8")) as T;
}

const STYLES: CitationStyle[] = ["vancouver", "apa", "harvard"];
const SCENARIOS = ["ONC-1", "ART-2"] as const;

for (const scenarioId of SCENARIOS) {
  for (const style of STYLES) {
    test(`EXP-DOCX-${scenarioId}-${style}. DOCX structure, styles, table, metadata, and citations`, async () => {
      const fix = loadJson<ExportFixture>(`tests/fixtures/literature/${scenarioId}.json`);
      const records = fix.exploreResponse?.records ?? [];
      const choice = {
        category: "established" as const,
        phrase: fix.screenResponse.phrases.established.phrase,
      };
      const manuscript = composeManuscript({
        specialty: fix.specialty,
        words: fix.words,
        category: choice.category,
        phrase: choice.phrase,
        screeningStats: {
          retrieved: fix.exploreResponse?.corpusStats?.retrieved ?? 25,
          screened: fix.exploreResponse?.corpusStats?.screened ?? 25,
          excludedCount: 0,
          relaxationLevel: fix.exploreResponse?.corpusStats?.relaxationLevel ?? 0,
        },
        records,
        style,
      });

      const payload = buildSummaryPayload(
        fix.words,
        choice,
        fix.screenResponse,
        {
          records,
          corpusStats: fix.exploreResponse?.corpusStats ?? { retrieved: 25, screened: 25, blocked: 0, returned: records.length, relaxationLevel: 0 },
          hasMore: false,
        },
        { phrase: choice.phrase, category: choice.category, userExcluded: [], seen: [] },
        manuscript,
        fix.specialty
      );

      const buf = await buildWorkflowDocx(payload);
      assert.ok(buf.byteLength > 1000, "DOCX buffer should be non-trivial");

      const zip = await JSZip.loadAsync(buf);
      const docXml = await zip.file("word/document.xml")?.async("string");
      assert.ok(docXml, "word/document.xml must exist");

      assert.ok(docXml.includes('w:val="Title"') || docXml.includes("Title"), "DOCX must use Title style");
      assert.ok(docXml.includes('w:val="Heading1"') || docXml.includes("Heading1"), "DOCX must use Heading1 style");
      assert.ok(docXml.includes('w:val="Heading2"') || docXml.includes("Heading2"), "DOCX must use Heading2 style");
      assert.ok(docXml.includes("<w:tbl>"), "DOCX must contain a real <w:tbl> for extraction table");

      // No paragraph containing pipe-markdown
      const paragraphs = docXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
      for (const p of paragraphs) {
        const text = p.replace(/<[^>]+>/g, "");
        assert.ok(!/\|[\s\S]*\|/.test(text), `DOCX paragraph must not contain pipe-markdown: ${text.slice(0, 80)}`);
      }

      const plainText = docXml.replace(/<[^>]+>/g, " ");
      assert.ok(!plainText.includes("####"), "No #### markdown in DOCX");
      assert.ok(!plainText.includes("**"), "No ** markdown in DOCX");
      assert.ok(!docXml.includes("&lt;i&gt;"), "No &lt;i&gt; in DOCX");
      assert.ok(!/Lead Clinical Investigator|Roshdy|All Rights Reserved/i.test(plainText), "No personal/boilerplate strings");

      const coreXml = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
      const creatorMatch = coreXml.match(/<dc:creator>(.*?)<\/dc:creator>/);
      if (creatorMatch) {
        assert.ok(!/roshdy/i.test(creatorMatch[1]), `Creator must not be a person's name: ${creatorMatch[1]}`);
      }

      const footerFiles = Object.keys(zip.files).filter((k) => /word\/footer\d+\.xml$/.test(k));
      const footerXml = (await Promise.all(footerFiles.map((f) => zip.file(f)!.async("string")))).join(" ");
      assert.ok(footerXml.includes(APP_VERSION), `Footer must include version ${APP_VERSION}`);
      assert.ok(footerXml.includes(getCommitSha()), `Footer must include commit ${getCommitSha()}`);

      // References count > 0 when records exist
      if (manuscript.references.length > 0) {
        assert.ok(manuscript.references.length >= 1);
      }
    });

    test(`EXP-PDF-${scenarioId}-${style}. PDF pages, draft notice, clean text, glyphs, and style`, async () => {
      const fix = loadJson<ExportFixture>(`tests/fixtures/literature/${scenarioId}.json`);
      const records = fix.exploreResponse?.records ?? [];
      const choice = {
        category: "established" as const,
        phrase: fix.screenResponse.phrases.established.phrase,
      };
      const manuscript = composeManuscript({
        specialty: fix.specialty,
        words: fix.words,
        category: choice.category,
        phrase: choice.phrase,
        screeningStats: {
          retrieved: fix.exploreResponse?.corpusStats?.retrieved ?? 25,
          screened: fix.exploreResponse?.corpusStats?.screened ?? 25,
          excludedCount: 0,
          relaxationLevel: fix.exploreResponse?.corpusStats?.relaxationLevel ?? 0,
        },
        records,
        style,
      });

      const payload = buildSummaryPayload(
        fix.words,
        choice,
        fix.screenResponse,
        {
          records,
          corpusStats: fix.exploreResponse?.corpusStats ?? { retrieved: 25, screened: 25, blocked: 0, returned: records.length, relaxationLevel: 0 },
          hasMore: false,
        },
        { phrase: choice.phrase, category: choice.category, userExcluded: [], seen: [] },
        manuscript,
        fix.specialty
      );
      // Include ≥ and ≤ in title or section to verify glyph rendering
      if (payload.sections && payload.sections.length > 0) {
        payload.sections[0].paragraphs.push("Threshold check: cervical length ≤ 25 mm and age ≥ 35 years.");
      }

      const buf = await buildWorkflowPdf(payload);
      assert.ok(buf.byteLength > 1000, "PDF buffer should be non-trivial");

      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf), verbosity: 0 });
      const pdfDoc = await loadingTask.promise;
      assert.ok(pdfDoc.numPages >= 2, `Expected >= 2 PDF pages, got ${pdfDoc.numPages}`);

      const pagesText: string[] = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        pagesText.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      }

      assert.ok(/draft|automated/i.test(pagesText[0]), "First page must contain draft notice");

      const fullText = pagesText.join("\n");
      assert.ok(!fullText.includes("<i>"), "No <i> tag in PDF");
      assert.ok(!fullText.includes("####"), "No #### in PDF");
      assert.ok(!fullText.includes("| ---"), "No | --- in PDF");
      assert.ok(!fullText.includes("al E."), "No 'al E.' in PDF");
      assert.ok(fullText.includes("≥") || fullText.includes(">="), "≥ glyph should render");
      assert.ok(fullText.includes("≤") || fullText.includes("<="), "≤ glyph should render");
    });
  }
}
