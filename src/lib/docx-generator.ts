import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel
} from "docx";
import type { WorkflowExportData } from "./summary-payload.ts";
import { getFooterText, DRAFT_DISCLAIMER } from "./version.ts";

export function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseFormattedDocxRuns(text: string, style = "vancouver"): TextRun[] {
  const cleaned = decodeEntities(text);
  const runs: TextRun[] = [];

  // Match markdown bold **...** and html italics <i>...</i> or <em>...</em>
  // Strip any remaining html tags
  const tokens = cleaned.split(/(\*\*.*?\*\*|<(?:i|em)>.*?<\/(?:i|em)>)/);

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("**") && token.endsWith("**")) {
      const inner = token.slice(2, -2).replace(/<[^>]*>/g, "");
      runs.push(
        new TextRun({
          text: inner,
          bold: true,
          font: "Arial",
          size: 20,
          color: "0F172A"
        })
      );
    } else if (/^<(?:i|em)>(.*?)<\/(?:i|em)>$/.test(token)) {
      const inner = token.replace(/^<(?:i|em)>|<\/(?:i|em)>$/g, "").replace(/<[^>]*>/g, "");
      runs.push(
        new TextRun({
          text: inner,
          italics: true,
          font: "Arial",
          size: 20,
          color: "334155"
        })
      );
    } else {
      const stripped = token.replace(/<[^>]*>/g, "");
      if (style === "vancouver") {
        const citeParts = stripped.split(/(\[[\d\s,\-]+\])/);
        for (const cp of citeParts) {
          if (/^\[([\d\s,\-]+)\]$/.test(cp)) {
            runs.push(
              new TextRun({
                text: cp,
                superScript: true,
                bold: true,
                color: "0F766E",
                font: "Arial"
              })
            );
          } else if (cp) {
            runs.push(
              new TextRun({
                text: cp,
                font: "Arial",
                size: 20,
                color: "334155"
              })
            );
          }
        }
      } else {
        runs.push(
          new TextRun({
            text: stripped,
            font: "Arial",
            size: 20,
            color: "334155"
          })
        );
      }
    }
  }

  return runs.length ? runs : [new TextRun({ text: cleaned.replace(/<[^>]*>/g, ""), font: "Arial", size: 20 })];
}

function parseMarkdownTableToDocx(md: string): Table | null {
  const lines = md.trim().split("\n").map(l => l.trim()).filter(l => l.startsWith("|") && l.endsWith("|"));
  if (lines.length < 2) return null;
  const headerLine = lines[0];
  const dataLines = lines.slice(1).filter(l => !/^[|\s:-]+$/.test(l));
  const headers = headerLine.slice(1, -1).split("|").map(c => c.trim());
  const rows = dataLines.map(l => l.slice(1, -1).split("|").map(c => c.trim()));

  const colWidthPct = Math.floor(100 / Math.max(1, headers.length));

  const tableRows = [
    new TableRow({
      children: headers.map(h => new TableCell({
        width: { size: colWidthPct, type: WidthType.PERCENTAGE },
        shading: { fill: "0F766E" },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", font: "Arial", size: 18 })] })]
      }))
    }),
    ...rows.map((row, rIdx) => new TableRow({
      children: row.map(cell => new TableCell({
        width: { size: colWidthPct, type: WidthType.PERCENTAGE },
        shading: { fill: rIdx % 2 === 0 ? "FFFFFF" : "F8FAFC" },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: cell, font: "Arial", size: 18, color: "1E293B" })] })]
      }))
    }))
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows
  });
}

export async function buildWorkflowDocx(workflow: WorkflowExportData): Promise<Buffer> {
  const docChildren: (Paragraph | Table)[] = [];

  // Title
  const titleText = workflow.title || workflow.phrase;
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: titleText.replace(/<[^>]*>/g, ""),
          font: "Arial",
          size: 36,
          bold: true,
          color: "0F172A"
        })
      ]
    })
  );

  // Subtitle
  const categoryLabel =
    workflow.category === "established"
      ? "established"
      : workflow.category === "conflicting"
      ? "conflicting"
      : "gap";

  const specialtySuffix = workflow.specialtyLabel ? ` · ${workflow.specialtyLabel}` : "";
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `AIMed workflow summary — ${categoryLabel} evidence focus${specialtySuffix}`,
          font: "Arial",
          size: 20,
          italics: true,
          color: "64748B"
        })
      ]
    })
  );

  // Automated Draft Disclaimer Banner
  docChildren.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 24, color: "F59E0B" },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: "FEF3C7" },
              margins: { top: 120, bottom: 120, left: 200, right: 160 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "AUTOMATED DRAFT NOTICE: ",
                      font: "Arial",
                      size: 18,
                      bold: true,
                      color: "92400E"
                    }),
                    new TextRun({
                      text: DRAFT_DISCLAIMER.replace(/^Automated draft\.\s*/i, ""),
                      font: "Arial",
                      size: 18,
                      color: "92400E"
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    })
  );

  if (workflow.sections && workflow.sections.length > 0) {
    // Abstract Section
    if (workflow.abstract && workflow.abstract.length > 0) {
      docChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 120 },
          children: [
            new TextRun({
              text: "Abstract",
              font: "Arial",
              size: 26,
              bold: true,
              color: "0F766E"
            })
          ]
        })
      );
      for (const absSent of workflow.abstract) {
        docChildren.push(
          new Paragraph({
            spacing: { after: 100 },
            children: parseFormattedDocxRuns(absSent, workflow.citationStyle)
          })
        );
      }
    }

    // Manuscript Sections (Background, Search strategy and screening, Evidence synthesis, Limitations, Conclusion)
    for (const sec of workflow.sections) {
      docChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 120 },
          children: [
            new TextRun({
              text: sec.heading,
              font: "Arial",
              size: 26,
              bold: true,
              color: "0F766E"
            })
          ]
        })
      );
      for (const p of sec.paragraphs) {
        if (/^#{2,4}\s+/.test(p)) {
          const subHeading = p.replace(/^#{2,4}\s+/, "").trim();
          docChildren.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
              children: parseFormattedDocxRuns(subHeading, workflow.citationStyle)
            })
          );
        } else if (p.trim().startsWith("|") && p.includes("\n|")) {
          const table = parseMarkdownTableToDocx(p);
          if (table) {
            docChildren.push(table);
          } else {
            docChildren.push(
              new Paragraph({
                spacing: { after: 160 },
                children: parseFormattedDocxRuns(p, workflow.citationStyle)
              })
            );
          }
        } else {
          docChildren.push(
            new Paragraph({
              spacing: { after: 160 },
              children: parseFormattedDocxRuns(p, workflow.citationStyle)
            })
          );
        }
      }
    }

    // References Section
    const styleLabel = (workflow.citationStyle || "vancouver").toUpperCase();
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 140 },
        children: [
          new TextRun({
            text: `REFERENCES (${styleLabel})`,
            font: "Arial",
            size: 26,
            bold: true,
            color: "0F766E"
          })
        ]
      })
    );

    if (workflow.references && workflow.references.length > 0) {
      for (const refLine of workflow.references) {
        docChildren.push(
          new Paragraph({
            indent: { left: 720, hanging: 720 },
            spacing: { after: 120 },
            children: parseFormattedDocxRuns(refLine, workflow.citationStyle)
          })
        );
      }
    } else {
      docChildren.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: "No references retained for synthesis.",
              font: "Arial",
              size: 18,
              italics: true,
              color: "64748B"
            })
          ]
        })
      );
    }
  } else {
    // Fallback: Clinical words (PICO) section
    docChildren.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [
          new TextRun({
            text: "Clinical words (PICO)",
            font: "Arial",
            size: 26,
            bold: true,
            color: "0F766E"
          })
        ]
      })
    );

    const wordsRows = [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill: "0F172A" },
            children: [new Paragraph({ children: [new TextRun({ text: "Role", bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })]
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            shading: { fill: "0F172A" },
            children: [new Paragraph({ children: [new TextRun({ text: "Clinical Word", bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })]
          })
        ]
      }),
      ...workflow.words.map(w =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: "F8FAFC" },
              children: [new Paragraph({ children: [new TextRun({ text: w.role.toUpperCase(), bold: true, font: "Arial", size: 20, color: "0F766E" })] })]
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: w.word, font: "Arial", size: 20, color: "1E293B" })] })]
            })
          ]
        })
      )
    ];

    docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: wordsRows }));
  }

  // Footer notice
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 120 },
      children: [
        new TextRun({
          text: getFooterText(),
          font: "Arial",
          size: 17,
          color: "64748B"
        })
      ]
    })
  );

  const doc = new Document({
    creator: workflow.author ? `${workflow.author} / AIMED` : "AIMED",
    sections: [
      {
        properties: {},
        children: docChildren
      }
    ]
  });

  return await Packer.toBuffer(doc);
}
