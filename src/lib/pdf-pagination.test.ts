import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";

test("PDF1. Pagination loop does NOT spawn phantom pages when writing header and footer", async () => {
  const doc = new PDFDocument({ size: "A4", margin: 56, compress: false, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // Add 3 full pages of dummy content
  for (let p = 0; p < 3; p++) {
    if (p > 0) doc.addPage();
    doc.fontSize(12).text(`Body paragraph for page ${p + 1}`);
    for (let j = 0; j < 15; j++) {
      doc.text(`Content line ${j + 1}: Systematic evidence review evaluating therapeutic endpoints in clinical cohorts.`);
    }
  }

  // Check buffered page range before headers/footers
  const initialRange = doc.bufferedPageRange();
  assert.equal(initialRange.count, 3, "Document should initially have 3 pages");

  // Apply running header and footer logic exactly as in route.ts
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
      doc.fontSize(8).text("Header Title Test", fLeft, 24, { width: fWidth, align: "left", lineBreak: false });
    }

    const footerY = doc.page.height - 38;
    doc.fontSize(8.5).text(
      "Aimed — Medical Intelligence Platform · Copyright©RaoufRoshdy2026",
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

    doc.page.margins.bottom = origBottomMargin;
    doc.page.margins.top = origTopMargin;
  }

  const finalRange = doc.bufferedPageRange();
  assert.equal(finalRange.count, 3, "Header and footer loop must NOT spawn phantom pages (page count must remain 3)");

  doc.flushPages();
  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  const pdfBuffer = Buffer.concat(chunks);
  const pdfString = pdfBuffer.toString("latin1");

  // Count "/Type /Page" occurrences (excluding /Pages)
  const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g);
  assert.equal(pageMatches?.length, 3, "Emitted PDF must contain exactly 3 /Type /Page objects, zero phantom pages");
});

test("PDF2. NotoSans Unicode fonts render medical symbols without mojibake", async () => {
  const fontsDir = path.resolve(process.cwd(), "public", "fonts");
  const regularPath = path.join(fontsDir, "NotoSans-Regular.ttf");
  const boldPath = path.join(fontsDir, "NotoSans-Bold.ttf");

  assert.ok(fs.existsSync(regularPath), "NotoSans-Regular.ttf must exist in public/fonts");
  assert.ok(fs.existsSync(boldPath), "NotoSans-Bold.ttf must exist in public/fonts");

  const doc = new PDFDocument({ size: "A4", margin: 56, compress: false });
  doc.registerFont("NotoSans", regularPath);
  doc.registerFont("NotoSans-Bold", boldPath);

  doc.font("NotoSans").fontSize(11);

  // Medical characters that previously failed in standard WinAnsi Helvetica
  const testString = "Cervical length ≤25 mm, survival ≥85%, systolic BP ±10 mmHg, 37.0°C, dose 200 μg, hazard ratio → 0.65, 2 × 2 contingency, α=0.05, β-hCG";
  
  // Calculate width for each symbol to ensure valid glyph mappings exist
  const symbols = ["≤", "≥", "±", "°", "μ", "→", "×", "α", "β"];
  for (const sym of symbols) {
    const width = doc.widthOfString(sym);
    assert.ok(width > 0, `Symbol "${sym}" must have positive rendered width in NotoSans`);
  }

  const fullWidth = doc.widthOfString(testString);
  assert.ok(fullWidth > 100, "Full test string must measure correctly");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  doc.text(testString);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  const pdfBuffer = Buffer.concat(chunks);
  assert.ok(pdfBuffer.length > 1000, "PDF buffer must be valid non-empty PDF");
});
