import { NextResponse } from "next/server";
import { z } from "zod";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { validateDeliverableIntegrity } from "@/lib/deliverable-integrity";
import { lintManuscriptQuality, type ManuscriptSection } from "@/lib/manuscript-quality";
import type { AuditableRef } from "@/lib/relevance";
import { buildWorkflowPdf, sanitizePdfText } from "@/lib/pdf-generator";
import { getFooterText, DRAFT_DISCLAIMER } from "@/lib/version";
import { verifyRecordSignature } from "@/lib/record-signature";

export const runtime = "nodejs";
export const maxDuration = 20;

const picoRowSchema = z.object({
  label: z.string().max(200),
  value: z.string().max(1000),
});

const pdfTableSchema = z.object({
  headers: z.array(z.string().max(500)),
  rows: z.array(z.array(z.string().max(2000)))
});

const pdfSectionSchema = z.object({
  heading: z.string().max(200).optional().nullable(),
  blocks: z.array(z.string().max(10000)),
  table: pdfTableSchema.optional().nullable()
});

const auditableRefSchema = z.object({
  pmid: z.string().max(50).optional().nullable(),
  title: z.string().max(1000),
  authors: z.string().max(1000).optional().nullable(),
  year: z.string().max(50).optional().nullable(),
  journal: z.string().max(500).optional().nullable(),
  doi: z.string().max(500).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  // An abstract is only needed for the integrity check; a very long one is truncated, not refused.
  context: z.string().max(200000).transform(v => v.slice(0, 20000)).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  crossrefId: z.string().max(100).optional().nullable(),
  openAlexId: z.string().max(100).optional().nullable(),
});

const workflowWordSchema = z.object({
  word: z.string().min(1).max(80),
  role: z.string().min(1).max(40)
});

const workflowScreeningStatsSchema = z.object({
  retrieved: z.number().int().nonnegative(),
  screened: z.number().int().nonnegative(),
  relaxationLevel: z.number().int().min(0).max(2),
  excludedCount: z.number().int().nonnegative()
});

const workflowPaperSchema = z.object({
  rank: z.number().int().positive(),
  relevancePct: z.number().int().min(0).max(100),
  title: z.string(),
  authors: z.string().optional().default(""),
  journal: z.string().optional().default(""),
  year: z.string().optional().default(""),
  design: z.string().optional().default("Observational study"),
  matchedElements: z.array(z.string()).optional().default([]),
  pmid: z.string().optional(),
  doi: z.string().optional(),
  context: z.string().optional(),
  _sig: z.string().optional()
});

const workflowSchema = z.object({
  words: z.array(workflowWordSchema).min(3).max(5),
  category: z.enum(["established", "conflicting", "gap"]),
  phrase: z.string().min(1).max(240),
  specialty: z.string().max(60).optional(),
  specialtyLabel: z.string().max(100).optional(),
  screeningStats: workflowScreeningStatsSchema,
  papers: z.array(workflowPaperSchema).max(50),
  title: z.string().max(240).optional(),
  abstract: z.array(z.string()).max(8).optional(),
  sections: z.array(z.object({
    heading: z.string().max(120),
    paragraphs: z.array(z.string()).min(1)
  })).max(10).optional(),
  references: z.array(z.string().max(2000)).max(50).optional(),
  citationStyle: z.enum(["vancouver", "apa", "harvard"]).optional(),
  aiEnriched: z.boolean().optional(),
  author: z.string().max(200).optional().nullable()
});

const pdfPayloadSchema = z.object({
  docType: z.string().max(100).optional().nullable(),
  title: z.string().min(1).max(500).optional().nullable(),
  meta: z.string().max(500).optional().nullable(),
  author: z.string().max(200).optional().nullable(),
  pico: z.array(picoRowSchema).optional().nullable(),
  outcomes: z.array(z.string().max(500)).optional().nullable(),
  keywords: z.array(z.string().max(100)).optional().nullable(),
  sections: z.array(pdfSectionSchema).optional().nullable(),
  references: z.array(z.string().max(2000)).optional().nullable(),
  retainedReferences: z.array(auditableRefSchema).optional().nullable(),
  citationStyle: z.enum(["vancouver", "apa", "harvard"]).optional().nullable(),
  workflow: workflowSchema.optional().nullable()
});

const BODY_MAX = 400_000;

function normalizeVancouver(text: string, citationStyle?: string | null): string {
  if (citationStyle === "vancouver" || !citationStyle) {
    return text.replace(/\[([\d\s,\-]+)\]/g, "$1");
  }
  return text;
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (!raw || raw.length > BODY_MAX) {
      return NextResponse.json({ error: "Payload too large or empty." }, { status: 400 });
    }
    // Malformed JSON is a client error. Letting JSON.parse throw into the outer catch reported
    // it as HTTP 500 "PDF generation failed", which told the caller to retry a request that
    // could never succeed and buried the real cause in server logs.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }

    const parseResult = pdfPayloadSchema.safeParse(parsed);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid parameters: " + parseResult.error.issues.map(e => e.message).join(", ") },
        { status: 400 }
      );
    }
    const body = parseResult.data;

    if (body.workflow) {
      if (Array.isArray(body.workflow.papers) && body.workflow.papers.length > 0) {
        for (const paper of body.workflow.papers) {
          if (!verifyRecordSignature(paper as unknown as Parameters<typeof verifyRecordSignature>[0])) {
            return NextResponse.json(
              { error: `Untrusted or fabricated record detected: paper '${paper.title || paper.pmid}' signature verification failed. Records must originate from verified Explore stage.` },
              { status: 422 }
            );
          }
        }
      }

      if (body.workflow.references && body.workflow.references.length > 0) {
        const narrativeFields: Record<string, string> = {};
        if (Array.isArray(body.workflow.sections)) {
          for (const s of body.workflow.sections) {
            if (s && s.heading && Array.isArray(s.paragraphs)) {
              narrativeFields[s.heading.toLowerCase()] = s.paragraphs.join(" ");
            }
          }
        }
        const integrity = validateDeliverableIntegrity({
          fields: narrativeFields,
          references: body.workflow.references,
          retainedRecords: (body.workflow.papers || []) as unknown as AuditableRef[],
          exportReferences: body.workflow.references
        });
        if (!integrity.ok) {
          return NextResponse.json(
            {
              error: integrity.malformedReferences.length
                ? "Export refused: the reference list contained malformed entries."
                : integrity.misanchoredCitations && integrity.misanchoredCitations.length > 0
                ? `Export refused: citations misanchored: ${integrity.misanchoredCitations.join("; ")}`
                : "Export refused: references did not match the validated evidence set.",
              integrity
            },
            { status: 422 }
          );
        }
      }
      const buffer = await buildWorkflowPdf(body.workflow);
      const style = body.workflow.citationStyle || "vancouver";
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="aimed-evidence-summary-${style}.pdf"`,
          "Cache-Control": "no-store"
        }
      });
    }

    // A caller that asks for a document with neither narrative sections nor references is asking
    // for a titled PDF with no content, which is misleading rather than merely empty. This must
    // not depend on whether `references` was sent as [] or omitted entirely: the two mean the
    // same thing to the reader, so they are treated the same way here. Exports that legitimately
    // have no references, such as the evidence map, carry sections and are unaffected.
    const hasReferences = Array.isArray(body.references) && body.references.length > 0;
    const hasSections = Array.isArray(body.sections) && body.sections.length > 0;
    if (!hasReferences && !hasSections) {
      return NextResponse.json(
        { error: "No references or sections available to export." },
        { status: 400 }
      );
    }
    // Server-side half of the parity gate. The browser already checks this, but the browser is
    // not the trust boundary: a caller can post to this endpoint directly, and a PDF is the most
    // durable and most citable artifact this app produces. Every reference emitted must be
    // accountable to a retained record the claim filter approved.
    if (Array.isArray(body.references) && body.references.length > 0) {
      const narrativeFields: Record<string, string> = {};
      if (Array.isArray(body.sections)) {
        for (const s of body.sections) {
          if (s && s.heading && Array.isArray(s.blocks)) {
            narrativeFields[s.heading.toLowerCase()] = s.blocks.join(" ");
          }
        }
      }
      const integrity = validateDeliverableIntegrity({
        fields: narrativeFields,
        references: body.references,
        retainedRecords: Array.isArray(body.retainedReferences) ? (body.retainedReferences as unknown as AuditableRef[]) : [],
        exportReferences: body.references
      });
      if (!integrity.ok) {
        return NextResponse.json(
          {
            error: integrity.malformedReferences.length
              ? "Export refused: the reference list contained malformed entries."
              : integrity.misanchoredCitations && integrity.misanchoredCitations.length > 0
              ? `Export refused: citations misanchored: ${integrity.misanchoredCitations.join("; ")}`
              : "Export refused: references did not match the validated evidence set.",
            integrity
          },
          { status: 422 }
        );
      }
    }

    // Manuscript Quality Linter gate for working draft exports
    if (hasSections) {
      const narrativeFields: Record<string, string> = {};
      if (Array.isArray(body.sections)) {
        for (const s of body.sections) {
          if (s && s.heading && Array.isArray(s.blocks)) {
            narrativeFields[s.heading.toLowerCase()] = s.blocks.join(" ");
          }
        }
      }
      const quality = lintManuscriptQuality({
        title: body.title || undefined,
        abstract: narrativeFields.abstract,
        introduction: narrativeFields.introduction,
        methods: narrativeFields.methods,
        results: narrativeFields.results,
        discussion: narrativeFields.discussion,
        conclusion: narrativeFields.conclusion,
        sections: (body.sections || undefined) as unknown as ManuscriptSection[] | undefined,
        references: body.references || [],
        retainedRecords: Array.isArray(body.retainedReferences) ? (body.retainedReferences as unknown as AuditableRef[]) : [],
        isSparse: !hasReferences
      });
      if (!quality.passed) {
        return NextResponse.json(
          {
            error: "Export refused: manuscript failed quality checks",
            quality
          },
          { status: 422 }
        );
      }
    }

    const doc = new PDFDocument({ size: "A4", margin: 56, compress: false, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));

    const fontsDir = path.join(process.cwd(), "public", "fonts");
    const regularFontPath = path.join(fontsDir, "NotoSans-Regular.ttf");
    const boldFontPath = path.join(fontsDir, "NotoSans-Bold.ttf");
    const italicFontPath = path.join(fontsDir, "NotoSans-Italic.ttf");

    let FONT = "Helvetica";
    let FONT_B = "Helvetica-Bold";
    let FONT_O = "Helvetica-Oblique";

    if (
      fs.existsSync(regularFontPath) &&
      fs.existsSync(boldFontPath) &&
      fs.existsSync(italicFontPath)
    ) {
      doc.registerFont("NotoSans", regularFontPath);
      doc.registerFont("NotoSans-Bold", boldFontPath);
      doc.registerFont("NotoSans-Italic", italicFontPath);
      FONT = "NotoSans";
      FONT_B = "NotoSans-Bold";
      FONT_O = "NotoSans-Italic";
    }

    const teal = "#0f766e";
    const ink = "#1c2430";
    const muted = "#8a95a0";

    const LEFT = doc.page.margins.left;
    const FULL_W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    /**
     * Writes a paragraph, rendering a leading "**Label:**" run-in in bold. Text is handed to PDFKit
     * unwrapped: pre-wrapping it with hard line breaks and letting PDFKit wrap again left single
     * words stranded on their own lines throughout the justified body text.
     */
    const paragraph = (raw: string, opts: { x?: number; width?: number; size?: number; align?: "justify" | "left"; lineGap?: number } = {}) => {
      const x = opts.x ?? LEFT;
      const width = opts.width ?? FULL_W;
      const size = opts.size ?? 10.5;
      const lineGap = opts.lineGap ?? 3.5;
      const m = /^\*\*([^*]{1,80}?)\*\*\s*([\s\S]*)$/.exec(raw.trim());
      const label = m ? sanitizePdfText(m[1].trim()) : "";
      const rest = sanitizePdfText((m ? m[2] : raw).replace(/\*\*/g, "").replace(/[*_`~]/g, "").trim());
      const h = doc.font(FONT).fontSize(size).heightOfString(`${label} ${rest}`, { width, lineGap });
      ensure(Math.min(h, 60));
      doc.x = x;
      if (label) {
        doc.font(FONT_B).fontSize(size).fillColor(ink).text(`${label} `, x, doc.y, { width, continued: true, lineGap, align: opts.align ?? "justify" });
        doc.font(FONT).fontSize(size).fillColor(ink).text(rest, { width, lineGap, align: opts.align ?? "justify" });
      } else {
        doc.font(FONT).fontSize(size).fillColor(ink).text(rest, x, doc.y, { width, lineGap, align: opts.align ?? "justify" });
      }
      doc.x = LEFT;
    };

    const ensure = (needed: number) => {
      if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
    };

    const title = sanitizePdfText(String(body.title).trim());
    doc.font(FONT_B).fontSize(8).fillColor(muted).text(String(body.docType || "Document").toUpperCase(), { align: "center" });
    doc.moveDown(0.5);
    doc.font(FONT_B).fontSize(19).fillColor(ink).text(title, { align: "center" });
    doc.moveDown(0.5);
    doc.font(FONT_O).fontSize(9.5).fillColor(muted).text(String(body.meta || ""), { align: "center" });
    if (body.author) {
      doc.moveDown(0.3);
      doc.font(FONT_B).fontSize(9.5).fillColor(ink).text(`Author: ${body.author}`, { align: "center" });
    }
    doc.moveDown(0.5);

    // Persistent Draft Notice Banner on Page 1
    const bannerH = doc.heightOfString(DRAFT_DISCLAIMER, { width: FULL_W - 24, lineGap: 2 }) + 14;
    ensure(bannerH + 10);
    const bannerY = doc.y;
    doc.rect(LEFT, bannerY, FULL_W, bannerH).fill("#fef3c7");
    doc.rect(LEFT, bannerY, FULL_W, bannerH).lineWidth(1).stroke("#f59e0b");
    doc.font(FONT_B).fontSize(8.5).fillColor("#92400e").text("AUTOMATED DRAFT: ", LEFT + 12, bannerY + 7, { continued: true });
    doc.font(FONT).fontSize(8.5).fillColor("#92400e").text(DRAFT_DISCLAIMER.replace(/^Automated draft\.\s*/i, ""), { width: FULL_W - 24, lineGap: 2 });
    doc.y = bannerY + bannerH + 12;

    if (Array.isArray(body.pico) && body.pico.length) {
      ensure(60);
      doc.font(FONT_B).fontSize(13).fillColor(teal).text("Clinical Question (PICO)");
      doc.moveDown(0.4);
      // Fixed label column so every row lines up; row height measured from the wrapped value.
      const labels = body.pico.filter(r => r && r.label).map(r => String(r.label));
      doc.font(FONT_B).fontSize(10);
      const labelW = Math.min(150, Math.max(...labels.map(l => doc.widthOfString(l))) + 16);
      const valueW = FULL_W - labelW - 16;
      for (const row of body.pico.filter(r => r && r.label)) {
        const value = String(row.value || "");
        doc.font(FONT).fontSize(10.5);
        const rowH = Math.max(22, doc.heightOfString(value || " ", { width: valueW, lineGap: 2 }) + 10);
        ensure(rowH + 4);
        const top = doc.y;
        doc.rect(LEFT, top, labelW, rowH).fill("#e3f2f2");
        doc.rect(LEFT, top, FULL_W, rowH).lineWidth(0.8).stroke("#b9c2cc");
        doc.font(FONT_B).fontSize(10).fillColor(teal).text(String(row.label), LEFT + 8, top + 5, { width: labelW - 12 });
        doc.font(FONT).fontSize(10.5).fillColor(ink).text(value, LEFT + labelW + 8, top + 5, { width: valueW, lineGap: 2 });
        doc.x = LEFT;
        doc.y = top + rowH + 4;
      }
      doc.moveDown(0.6);
    }

    if (Array.isArray(body.outcomes) && body.outcomes.length) {
      ensure(40);
      doc.font(FONT_B).fontSize(13).fillColor(teal).text("Selected Outcomes", LEFT, doc.y, { width: FULL_W });
      doc.moveDown(0.35);
      doc.font(FONT).fontSize(10.5).fillColor(ink);
      body.outcomes.forEach((o, i) => {
        ensure(20);
        doc.text(`  ${i + 1}.  ${o}`, doc.page.margins.left + 6, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 18, lineGap: 3 });
        doc.moveDown(0.35);
      });
      doc.moveDown(0.4);
    }

    if (Array.isArray(body.keywords) && body.keywords.length) {
      ensure(20);
      doc.font(FONT_B).fontSize(10).fillColor("#444d58").text("Keywords: ", LEFT, doc.y, { width: FULL_W, continued: true, lineGap: 3 });
      doc.font(FONT_O).fontSize(10).fillColor("#444d58").text(body.keywords.join("; "), { width: FULL_W, lineGap: 3 });
      doc.x = LEFT;
      doc.moveDown(0.6);
    }

    const renderPdfTable = (headers: string[], rows: string[][]) => {
      if (!headers.length || !rows.length) return;
      const numCols = headers.length;
      const colW = FULL_W / numCols;
      const cellPad = 4;
      const fontSize = numCols > 6 ? 7 : numCols > 5 ? 7.5 : numCols > 4 ? 8 : 8.5;
      const headerH = 22;

      ensure(headerH + 20);
      const startY = doc.y;
      doc.rect(LEFT, startY, FULL_W, headerH).fill(teal);
      headers.forEach((h, i) => {
        const x = LEFT + i * colW;
        doc.font(FONT_B).fontSize(fontSize).fillColor("#ffffff").text(h, x + cellPad, startY + 5, {
          width: colW - cellPad * 2,
          lineBreak: true,
          align: "left"
        });
      });
      doc.y = startY + headerH;

      rows.forEach((row, rIdx) => {
        doc.font(FONT).fontSize(fontSize);
        let maxH = 18;
        row.forEach(cell => {
          const w = colW - cellPad * 2;
          const h = doc.heightOfString(String(cell || ""), { width: w, lineGap: 1.5 });
          if (h + 8 > maxH) maxH = h + 8;
        });

        ensure(maxH);
        const rowY = doc.y;
        const fill = rIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(LEFT, rowY, FULL_W, maxH).fill(fill);
        doc.rect(LEFT, rowY, FULL_W, maxH).lineWidth(0.5).stroke("#cbd5e1");

        row.forEach((cell, i) => {
          const x = LEFT + i * colW;
          doc.rect(x, rowY, colW, maxH).lineWidth(0.5).stroke("#cbd5e1");
          const cleanCell = normalizeVancouver(String(cell || ""), body.citationStyle);
          doc.font(FONT).fontSize(fontSize).fillColor(ink).text(cleanCell, x + cellPad, rowY + 4, {
            width: colW - cellPad * 2,
            lineGap: 1.5,
            align: "left"
          });
        });
        doc.y = rowY + maxH;
      });
      doc.moveDown(0.6);
    };

    if (Array.isArray(body.sections)) {
      const renderedTablesInBlocks = new Set<string>();
      for (const section of body.sections) {
        if (!section || !Array.isArray(section.blocks) || !section.blocks.length) continue;
        if (section.heading) {
          ensure(46);
          doc.font(FONT_B).fontSize(13).fillColor(teal).text(sanitizePdfText(String(section.heading)), LEFT, doc.y, { width: FULL_W });
          doc.moveDown(0.15);
          doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(teal).lineWidth(1.2).stroke();
          doc.moveDown(0.4);
        }
        for (const block of section.blocks) {
          // Normalize line breaks in case block contains multiple sub-paragraphs or headers
          const rawSubBlocks = String(block || "")
            .replace(/\r\n/g, "\n")
            .split(/\n{2,}/)
            .map(s => s.trim())
            .filter(Boolean);

          for (const rawSub of rawSubBlocks) {
            // Check if subBlock is a markdown table
            if (rawSub.trim().startsWith("|") && rawSub.includes("---")) {
              const lines = rawSub.trim().split("\n").map(l => l.trim()).filter(Boolean);
              if (lines.length >= 3) {
                const headerLine = lines[0];
                const rowLines = lines.slice(2);
                const headers = headerLine.split("|").map(c => c.trim()).filter(Boolean);
                const rows = rowLines.map(r => {
                  const rawCells = r.split("|").map(c => c.trim());
                  return rawCells.filter((_, i) => i > 0 && i < rawCells.length - 1);
                });
                renderPdfTable(headers, rows);
                renderedTablesInBlocks.add(section.heading || "");
                continue;
              }
            }

            // Check if subBlock is a markdown heading
            if (/^#{1,4}\s+/.test(rawSub)) {
              let headTitle = rawSub.replace(/^#{1,4}\s+/, "").replace(/\*\*/g, "").trim();
              headTitle = sanitizePdfText(normalizeVancouver(headTitle, body.citationStyle));
              ensure(32);
              doc.moveDown(0.2);
              doc.font(FONT_B).fontSize(11.5).fillColor("#14535a").text(headTitle, LEFT, doc.y, {
                width: FULL_W,
                lineGap: 2
              });
              doc.moveDown(0.35);
              continue;
            }

            // Check if subBlock is a bullet list
            if (rawSub.startsWith("- ") || rawSub.startsWith("• ") || rawSub.startsWith("* ")) {
              const items = rawSub
                .split(/\n(?=[-•*]\s+)/)
                .map(it => it.replace(/^[-•*]\s+/, "").trim())
                .filter(Boolean);
              for (const it of items) {
                const cleanIt = sanitizePdfText(normalizeVancouver(it, body.citationStyle));
                doc.font(FONT).fontSize(10.5);
                ensure(Math.min(doc.heightOfString(cleanIt.replace(/\*\*/g, ""), { width: FULL_W - 18 }), 48) + 6);
                const bulletY = doc.y;
                doc.font(FONT_B).fontSize(10).fillColor(teal).text("•", LEFT + 4, bulletY, { lineBreak: false });
                doc.y = bulletY;
                paragraph(cleanIt, { x: LEFT + 16, width: FULL_W - 18, align: "left", lineGap: 3 });
                doc.moveDown(0.3);
              }
              doc.moveDown(0.2);
              continue;
            }

            // Normal paragraph (a leading "**Label:**" is rendered as a bold run-in)
            const text = sanitizePdfText(normalizeVancouver(rawSub.replace(/[_#`~]/g, "").trim(), body.citationStyle));
            if (!text.replace(/\*/g, "").trim()) continue;
            const plain = text.replace(/\*\*/g, "");
            const shortHead = plain.length < 70 && !/[.!?:]\s*$/.test(plain) && !/^\*\*/.test(text);
            if (shortHead) {
              ensure(26);
              doc.font(FONT_B).fontSize(11).fillColor("#14535a").text(plain, LEFT, doc.y, {
                width: FULL_W,
                lineGap: 3
              });
              doc.moveDown(0.3);
              continue;
            }
            paragraph(text);
            doc.moveDown(0.45);
          }
        }
        if (section.table && Array.isArray(section.table.headers) && section.table.headers.length > 0 && !renderedTablesInBlocks.has(section.heading || "")) {
          renderPdfTable(section.table.headers, section.table.rows);
        }
      }
    }

    if (Array.isArray(body.references) && body.references.length) {
      ensure(46);
      const refTitle = body.citationStyle === "apa"
        ? "References (APA 7th Edition)"
        : body.citationStyle === "harvard"
          ? "References (Harvard Style)"
          : "References (Vancouver Style · Without Brackets)";
      doc.font(FONT_B).fontSize(13).fillColor(teal).text(refTitle, LEFT, doc.y, { width: FULL_W });
      doc.moveDown(0.15);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(teal).lineWidth(1.2).stroke();
      doc.moveDown(0.4);
      doc.font(FONT).fontSize(10).fillColor(ink);
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      body.references.forEach((r, i) => {
        const text = sanitizePdfText(String(r || "").replace(/^\[?\d+\]?[\.\)]?\s*/, ""));
        const numbered = !(body.citationStyle === "apa" || body.citationStyle === "harvard");
        doc.font(FONT).fontSize(10);
        const h = doc.heightOfString(text, { width: width - 22, lineGap: 2.5 });
        ensure(Math.min(h, 80) + 6);
        const y = doc.y;
        if (numbered) doc.font(FONT_B).fontSize(10).fillColor(teal).text(`${i + 1}.`, LEFT, y, { width: 20, lineBreak: false });
        doc.font(FONT).fontSize(10).fillColor(ink).text(text, numbered ? LEFT + 22 : LEFT, y, { width: numbered ? width - 22 : width, lineGap: 2.5 });
        doc.x = LEFT;
        doc.moveDown(0.4);
      });
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fLeft: number = doc.page.margins.left;
      const fRight: number = doc.page.width - doc.page.margins.right;
      const fWidth: number = fRight - fLeft;

      const origBottomMargin = doc.page.margins.bottom;
      const origTopMargin = doc.page.margins.top;
      // Temporarily clear margins so writing header/footer in margin area never triggers addPage()
      doc.page.margins.bottom = 0;
      doc.page.margins.top = 0;

      // Running header on page 2+
      if (i > range.start) {
        doc.font(FONT_O).fontSize(8).fillColor(muted);
        const headerText = title.length > 70 ? title.slice(0, 67) + "…" : title;
        doc.text(headerText, fLeft, 24, { width: fWidth, align: "left", lineBreak: false });
        doc.moveTo(fLeft, 36).lineTo(fRight, 36).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
      }

      // Running footer on every page
      const footerY = doc.page.height - 38;
      doc.moveTo(fLeft, footerY - 6).lineTo(fRight, footerY - 6).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
      doc.font(FONT_O).fontSize(8.5).fillColor(muted);
      doc.text(
        getFooterText(),
        fLeft,
        footerY,
        { width: fWidth - 110, lineBreak: false }
      );
      const pageNumText = `Page ${i - range.start + 1} of ${range.count}`;
      doc.text(
        pageNumText,
        fRight - 100,
        footerY,
        { width: 100, align: "right", lineBreak: false }
      );

      // Restore margins
      doc.page.margins.bottom = origBottomMargin;
      doc.page.margins.top = origTopMargin;
    }
    doc.flushPages();
    doc.end();
    // Must also settle on stream error: otherwise a PDFKit failure leaves this
    // promise pending forever and the request hangs until the platform timeout.
    await new Promise<void>((resolve, reject) => {
      doc.on("end", () => resolve());
      doc.on("error", reject);
    });
    const pdf = Buffer.concat(chunks);
    const safe = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "document";

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe}.pdf"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    console.error("PDF generation failed:", e);
    return NextResponse.json({ error: "PDF generation failed. Please retry." }, { status: 500 });
  }
}