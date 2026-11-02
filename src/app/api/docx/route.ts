import { NextResponse } from "next/server";
import { z } from "zod";
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
  Header,
  Footer,
  PageNumber
} from "docx";
import { validateDeliverableIntegrity } from "@/lib/deliverable-integrity";
import type { AuditableRef } from "@/lib/relevance";
import { getSpecialtyDefinition } from "@/lib/specialties";

export const runtime = "nodejs";
export const maxDuration = 20;

const picoRowSchema = z.object({
  label: z.string().max(200),
  value: z.string().max(1000),
});

const docxSectionSchema = z.object({
  heading: z.string().max(200).optional().nullable(),
  blocks: z.array(z.string().max(10000)),
});

const auditableRefSchema = z.object({
  pmid: z.string().max(50).optional().nullable(),
  title: z.string().max(1000),
  authors: z.string().max(1000).optional().nullable(),
  year: z.string().max(50).optional().nullable(),
  journal: z.string().max(500).optional().nullable(),
  doi: z.string().max(500).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  context: z.string().max(20000).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  crossrefId: z.string().max(100).optional().nullable(),
  openAlexId: z.string().max(100).optional().nullable(),
});

const docxPayloadSchema = z.object({
  docType: z.string().max(100).optional().nullable(),
  title: z.string().min(1).max(500),
  meta: z.string().max(500).optional().nullable(),
  specialty: z.string().max(100).optional().nullable(),
  pico: z.array(picoRowSchema).optional().nullable(),
  outcomes: z.array(z.string().max(500)).optional().nullable(),
  keywords: z.array(z.string().max(100)).optional().nullable(),
  sections: z.array(docxSectionSchema).optional().nullable(),
  references: z.array(z.string().max(2000)).optional().nullable(),
  retainedReferences: z.array(auditableRefSchema).optional().nullable(),
  citationStyle: z.enum(["vancouver", "apa", "harvard"]).optional().nullable()
});

const BODY_MAX = 400_000;

function parseFormattedRuns(text: string, style: "vancouver" | "apa" | "harvard" = "vancouver"): TextRun[] {
  const runs: TextRun[] = [];
  // Split by markdown bold **...**
  const boldParts = text.split(/\*\*(.*?)\*\*/);

  for (let bIdx = 0; bIdx < boldParts.length; bIdx++) {
    const isBold = bIdx % 2 === 1;
    const part = boldParts[bIdx];
    if (!part) continue;

    if (style === "vancouver") {
      // Numerical citations: [1], [1, 2], [1-3]
      const citeParts = part.split(/(\[[\d\s,\-]+\])/);
      for (const cp of citeParts) {
        if (/^\[([\d\s,\-]+)\]$/.test(cp)) {
          const num = cp.replace(/[\[\]]/g, "");
          runs.push(
            new TextRun({
              text: num,
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
              bold: isBold,
              color: isBold ? "0F172A" : "1E293B",
              font: "Arial",
              size: 22
            })
          );
        }
      }
    } else {
      runs.push(
        new TextRun({
          text: part,
          bold: isBold,
          color: isBold ? "0F172A" : "1E293B",
          font: "Arial",
          size: 22
        })
      );
    }
  }

  return runs.length ? runs : [new TextRun({ text, font: "Arial", size: 22 })];
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (!raw || raw.length > BODY_MAX) {
      return NextResponse.json({ error: "Payload too large or empty." }, { status: 400 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }

    const parseResult = docxPayloadSchema.safeParse(parsed);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid parameters: " + parseResult.error.issues.map(e => e.message).join(", ") },
        { status: 400 }
      );
    }
    const body = parseResult.data;

    const hasReferences = Array.isArray(body.references) && body.references.length > 0;
    const hasSections = Array.isArray(body.sections) && body.sections.length > 0;
    if (!hasReferences && !hasSections) {
      return NextResponse.json(
        { error: "No references or sections available to export." },
        { status: 400 }
      );
    }

    // Parity gate: refuse deliverable if bibliography does not match retained evidence
    if (Array.isArray(body.references) && body.references.length > 0) {
      const integrity = validateDeliverableIntegrity({
        fields: {},
        references: body.references,
        retainedRecords: Array.isArray(body.retainedReferences)
          ? (body.retainedReferences as unknown as AuditableRef[])
          : [],
        exportReferences: body.references
      });
      if (!integrity.ok) {
        return NextResponse.json(
          {
            error: integrity.malformedReferences.length
              ? "Export refused: the reference list contained malformed entries."
              : "Export refused: references did not match the validated evidence set.",
            integrity
          },
          { status: 422 }
        );
      }
    }

    const title = String(body.title).trim();
    const style = body.citationStyle || "vancouver";
    const styleLabel =
      style === "apa"
        ? "APA 7th Edition"
        : style === "harvard"
          ? "Harvard Style"
          : "Vancouver Style (ICMJE/NLM · Superscript Unbracketed)";

    const specDef = body.specialty ? getSpecialtyDefinition(body.specialty) : undefined;
    const specialtyName = specDef?.label || "Clinical Medicine";
    const authorityGuidelines = specDef?.authorityGuidelines || "ACOG, NICE, RCOG, SOGC, WHO International Guidelines";

    const docChildren: (Paragraph | Table)[] = [];

    // Eyebrow / Department Tag
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 180 },
        children: [
          new TextRun({
            text: "AIMED MEDICAL INTELLIGENCE PLATFORM · CLINICAL EVIDENCE DIRECTORATE",
            font: "Arial",
            size: 17,
            bold: true,
            color: "64748B"
          })
        ]
      })
    );

    // Document Title (Heading 1)
    docChildren.push(
      new Paragraph({
        spacing: { before: 120, after: 240 },
        children: [
          new TextRun({
            text: title,
            font: "Arial",
            size: 38,
            bold: true,
            color: "0F172A"
          })
        ]
      })
    );

    // Metadata Table Box
    const metaRows: [string, string][] = [
      ["Lead Clinical Investigator", "Dr. Raouf Roshdy, MD"],
      ["Clinical Specialty Domain", specialtyName],
      ["Authority Guidelines", authorityGuidelines],
      ["Synthesis Date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
      ["Citation & Style Protocol", styleLabel],
      ["Evidence Base Indexing", "PubMed/MEDLINE, Europe PMC, Semantic Scholar, OpenAlex, CrossRef"]
    ];

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: metaRows.map(([lbl, val]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 28, type: WidthType.PERCENTAGE },
                shading: { fill: "F8FAFC" },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: lbl, bold: true, font: "Arial", size: 19, color: "0F172A" })]
                  })
                ]
              }),
              new TableCell({
                width: { size: 72, type: WidthType.PERCENTAGE },
                shading: { fill: "F8FAFC" },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: val, font: "Arial", size: 19, color: "334155" })]
                  })
                ]
              })
            ]
          })
        )
      })
    );

    docChildren.push(new Paragraph({ spacing: { after: 200 } }));

    // Clinical Evidence & Educational Disclaimer Box
    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F0FDFA" },
                borders: {
                  left: { style: BorderStyle.SINGLE, size: 28, color: "0D9488" },
                  top: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE }
                },
                children: [
                  new Paragraph({
                    spacing: { before: 80, after: 80 },
                    children: [
                      new TextRun({
                        text: "Clinical Evidence & Educational Notice: ",
                        bold: true,
                        font: "Arial",
                        size: 19,
                        color: "134E4A"
                      }),
                      new TextRun({
                        text: "This scientific commentary synthesizes peer-reviewed clinical evidence retrieved against strict PICO claim-level relevance boundaries. All citations are ground-verified against published PubMed/DOI records. Intended for academic commentary, clinical synthesis, and research guidance under ICMJE standards.",
                        font: "Arial",
                        size: 19,
                        color: "134E4A"
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

    docChildren.push(new Paragraph({ spacing: { after: 240 } }));

    // PICO Table
    if (Array.isArray(body.pico) && body.pico.length) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 200, after: 120 },
          children: [
            new TextRun({
              text: "Structured Clinical Question Specification (PICO)",
              font: "Arial",
              size: 26,
              bold: true,
              color: "0F766E"
            })
          ]
        })
      );

      const tableRows = [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              shading: { fill: "0F172A" },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "PICO Component", bold: true, color: "FFFFFF", font: "Arial", size: 20 })]
                })
              ]
            }),
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              shading: { fill: "0F172A" },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Clinical Specification", bold: true, color: "FFFFFF", font: "Arial", size: 20 })]
                })
              ]
            })
          ]
        }),
        ...body.pico.filter(r => r && r.label).map(r =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                shading: { fill: "F8FAFC" },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: String(r.label), bold: true, font: "Arial", size: 20, color: "0F172A" })]
                  })
                ]
              }),
              new TableCell({
                width: { size: 75, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: String(r.value || ""), font: "Arial", size: 20, color: "1E293B" })]
                  })
                ]
              })
            ]
          })
        )
      ];

      docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
      docChildren.push(new Paragraph({ spacing: { after: 240 } }));
    }

    // Keywords
    if (Array.isArray(body.keywords) && body.keywords.length) {
      docChildren.push(
        new Paragraph({
          spacing: { after: 180 },
          children: [
            new TextRun({ text: "Keywords (MeSH): ", bold: true, font: "Arial", size: 21, color: "0F172A" }),
            new TextRun({ text: body.keywords.join("; "), italics: true, font: "Arial", size: 21, color: "475569" })
          ]
        })
      );
    }

    // Narrative Sections (Abstract, Introduction, Discussion, Conclusion)
    if (Array.isArray(body.sections)) {
      for (const section of body.sections) {
        if (!section || !Array.isArray(section.blocks) || !section.blocks.length) continue;

        if (section.heading) {
          docChildren.push(
            new Paragraph({
              spacing: { before: 280, after: 140 },
              children: [
                new TextRun({
                  text: String(section.heading),
                  font: "Arial",
                  size: 26,
                  bold: true,
                  color: "0F766E"
                })
              ]
            })
          );
        }

        for (const block of section.blocks) {
          const rawSubBlocks = String(block || "")
            .replace(/\r\n/g, "\n")
            .split(/\n{2,}/)
            .map(s => s.trim())
            .filter(Boolean);

          for (const rawSub of rawSubBlocks) {
            // Check heading
            if (/^#{1,4}\s+/.test(rawSub)) {
              const headTitle = rawSub.replace(/^#{1,4}\s+/, "").replace(/\*\*/g, "").trim();
              docChildren.push(
                new Paragraph({
                  spacing: { before: 200, after: 100 },
                  children: [
                    new TextRun({
                      text: headTitle,
                      font: "Arial",
                      size: 23,
                      bold: true,
                      color: "134E4A"
                    })
                  ]
                })
              );
              continue;
            }

            // Check bullet list
            if (rawSub.startsWith("- ") || rawSub.startsWith("• ") || rawSub.startsWith("* ")) {
              const items = rawSub
                .split(/\n(?=[-•*]\s+)/)
                .map(it => it.replace(/^[-•*]\s+/, "").trim())
                .filter(Boolean);

              for (const it of items) {
                docChildren.push(
                  new Paragraph({
                    bullet: { level: 0 },
                    spacing: { after: 80 },
                    children: parseFormattedRuns(it, style)
                  })
                );
              }
              continue;
            }

            // Normal paragraph
            docChildren.push(
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 140, line: 276 },
                children: parseFormattedRuns(rawSub, style)
              })
            );
          }
        }
      }
    }

    // References Section
    if (Array.isArray(body.references) && body.references.length) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 320, after: 140 },
          children: [
            new TextRun({
              text: `References (${styleLabel})`,
              font: "Arial",
              size: 26,
              bold: true,
              color: "0F766E"
            })
          ]
        })
      );

      body.references.forEach((r, i) => {
        const text = String(r || "").replace(/^\[?\d+\]?[\.\)]?\s*/, "").trim();
        const formattedEntry =
          style === "apa" || style === "harvard" ? text : `${i + 1}.  ${text}`;

        docChildren.push(
          new Paragraph({
            spacing: { after: 100, line: 260 },
            alignment: AlignmentType.JUSTIFIED,
            indent: style !== "vancouver" ? { left: 720, hanging: 720 } : undefined,
            children: [
              new TextRun({
                text: formattedEntry,
                font: "Arial",
                size: 20,
                color: "1E293B"
              })
            ]
          })
        );
      });
    }

    // Footer notice
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 360, after: 120 },
        children: [
          new TextRun({
            text: "Aimed — Multi-Specialty Medical Intelligence Platform · Copyright © Raouf Roshdy 2026 · All Rights Reserved",
            font: "Arial",
            size: 17,
            color: "64748B"
          })
        ]
      })
    );

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                bottom: 1440,
                left: 1440,
                right: 1440
              }
            }
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: title.length > 70 ? title.slice(0, 67) + "…" : title,
                      font: "Arial",
                      size: 16,
                      color: "94A3B8",
                      italics: true
                    })
                  ]
                })
              ]
            })
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: "Aimed Medical Intelligence · Page ",
                      font: "Arial",
                      size: 17,
                      color: "64748B"
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: "Arial",
                      size: 17,
                      color: "64748B"
                    }),
                    new TextRun({
                      text: " of ",
                      font: "Arial",
                      size: 17,
                      color: "64748B"
                    }),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                      font: "Arial",
                      size: 17,
                      color: "64748B"
                    })
                  ]
                })
              ]
            })
          },
          children: docChildren
        }
      ]
    });

    const docxBuffer = await Packer.toBuffer(doc);
    const safe =
      String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "document";

    return new NextResponse(new Uint8Array(docxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safe}-manuscript.docx"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    console.error("DOCX generation failed:", e);
    return NextResponse.json({ error: "DOCX generation failed. Please retry." }, { status: 500 });
  }
}
