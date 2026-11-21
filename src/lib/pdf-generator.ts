import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import type { WorkflowExportData } from "./summary-payload.ts";

export async function buildWorkflowPdf(workflow: WorkflowExportData): Promise<Buffer> {
  const PAGE_MARGIN = 54;
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, compress: false, bufferPages: true });
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

  const teal = "#0f6b6b";
  const ink = "#1c2430";
  const muted = "#8a95a0";

  const reserveSpace = (needed: number) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
  };

  // Header Title Area
  const titleText = workflow.title || workflow.phrase;
  doc.font(FONT_B).fontSize(8).fillColor(muted).text("WORKFLOW SUMMARY", { align: "center" });
  doc.moveDown(0.4);
  doc.font(FONT_B).fontSize(16).fillColor(ink).text(titleText, { align: "center" });
  doc.moveDown(0.4);
  const categoryLabel = workflow.category;
  const specialtySuffix = workflow.specialtyLabel ? ` · ${workflow.specialtyLabel}` : "";
  doc.font(FONT_O).fontSize(9.5).fillColor(muted).text(
    `AIMed workflow summary — ${categoryLabel} evidence focus${specialtySuffix}`,
    { align: "center" }
  );
  doc.moveDown(0.8);

  // Educational Disclaimer Callout Banner
  reserveSpace(46);
  const discTop = doc.y;
  const discWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.rect(doc.page.margins.left, discTop, discWidth, 38).fillColor("#f1f5f9").strokeColor("#cbd5e1").lineWidth(0.75).fillAndStroke();
  doc.font(FONT_B).fontSize(8.5).fillColor(teal).text("EDUCATIONAL DISCLAIMER:", doc.page.margins.left + 12, discTop + 5);
  doc.font(FONT_O).fontSize(8).fillColor("#334155").text(
    "AIMed is an assistive clinical intelligence platform for educational and inquiry formulation only. Synthesized claims, outcomes, and proposed questions require independent clinical verification against original peer-reviewed literature.",
    doc.page.margins.left + 12,
    discTop + 16,
    { width: discWidth - 24, lineGap: 1.5 }
  );
  doc.y = discTop + 46;

  if (workflow.sections && workflow.sections.length > 0) {
    // Abstract Section
    if (workflow.abstract && workflow.abstract.length > 0) {
      reserveSpace(36);
      doc.font(FONT_B).fontSize(12).fillColor(teal).text("Abstract");
      doc.moveDown(0.3);
      for (const sent of workflow.abstract) {
        reserveSpace(20);
        doc.font(FONT).fontSize(9.5).fillColor(ink).text(sent, { lineGap: 2.5 });
        doc.moveDown(0.2);
      }
      doc.moveDown(0.5);
    }

    // Manuscript Sections
    for (const sec of workflow.sections) {
      reserveSpace(36);
      doc.font(FONT_B).fontSize(12).fillColor(teal).text(sec.heading);
      doc.moveDown(0.3);
      for (const p of sec.paragraphs) {
        reserveSpace(28);
        doc.font(FONT).fontSize(9.5).fillColor(ink).text(p, { lineGap: 2.5 });
        doc.moveDown(0.3);
      }
      doc.moveDown(0.4);
    }

    // References Section
    const styleLabel = (workflow.citationStyle || "vancouver").toUpperCase();
    reserveSpace(36);
    doc.font(FONT_B).fontSize(12).fillColor(teal).text(`References (${styleLabel})`);
    doc.moveDown(0.3);

    if (workflow.references && workflow.references.length > 0) {
      for (const refLine of workflow.references) {
        reserveSpace(24);
        doc.font(FONT).fontSize(8.5).fillColor(ink).text(refLine, { lineGap: 2 });
        doc.moveDown(0.2);
      }
    } else {
      doc.font(FONT_O).fontSize(8.5).fillColor(muted).text("No references retained for synthesis.");
    }
  } else {
    // Fallback if no sections
    reserveSpace(30);
    doc.font(FONT_B).fontSize(12).fillColor(teal).text("Clinical words (PICO)");
    doc.moveDown(0.3);
    for (const w of workflow.words) {
      reserveSpace(18);
      doc.font(FONT_B).fontSize(9).fillColor(teal).text(`${w.role.toUpperCase()}: `, { continued: true });
      doc.font(FONT).fontSize(9).fillColor(ink).text(w.word);
    }
  }

  // Header and footer loop on buffered pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fLeft = doc.page.margins.left;
    const fRight = doc.page.width - doc.page.margins.right;
    const fWidth = fRight - fLeft;

    const origBottomMargin = doc.page.margins.bottom;
    const origTopMargin = doc.page.margins.top;
    doc.page.margins.bottom = 0;
    doc.page.margins.top = 0;

    if (i > range.start) {
      doc.font(FONT_O).fontSize(8).fillColor(muted).text(
        "AIMed v4.0 · Workflow Summary · Evidence-Based Medicine",
        fLeft,
        24,
        { width: fWidth, align: "right", lineBreak: false }
      );
      doc.moveTo(fLeft, 36).lineTo(fRight, 36).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
    }

    const bottomY = doc.page.height - 38;
    doc.moveTo(fLeft, bottomY - 6).lineTo(fRight, bottomY - 6).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
    doc.font(FONT_O).fontSize(8.5).fillColor(muted).text(
      "AIMed — Medical Intelligence Platform · Copyright©RaoufRoshdy2026",
      fLeft,
      bottomY,
      { width: fWidth - 110, lineBreak: false }
    );
    doc.text(
      `Page ${i - range.start + 1} of ${range.count}`,
      fRight - 100,
      bottomY,
      { width: 100, align: "right", lineBreak: false }
    );

    doc.page.margins.bottom = origBottomMargin;
    doc.page.margins.top = origTopMargin;
  }

  doc.flushPages();
  doc.end();

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
