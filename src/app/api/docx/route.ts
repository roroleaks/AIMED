import { ALL_SOURCES_LABEL } from "@/lib/literature-sources";
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
  PageNumber,
  HeadingLevel
} from "docx";
import { validateDeliverableIntegrity } from "@/lib/deliverable-integrity";
import { lintManuscriptQuality, type ManuscriptSection } from "@/lib/manuscript-quality";
import type { AuditableRef } from "@/lib/relevance";
import { getSpecialtyDefinition } from "@/lib/specialties";
import { buildWorkflowDocx, parseFormattedDocxRuns } from "@/lib/docx-generator";
import { getFooterText, DRAFT_DISCLAIMER } from "@/lib/version";
import { verifyRecordSignature } from "@/lib/record-signature";

export const runtime = "nodejs";
export const maxDuration = 20;

const picoRowSchema = z.object({
  label: z.string().max(200),
  value: z.string().max(1000),
});

const docxTableSchema = z.object({
  headers: z.array(z.string().max(500)),
  rows: z.array(z.array(z.string().max(2000)))
});

const docxSectionSchema = z.object({
  heading: z.string().max(200).optional().nullable(),
  blocks: z.array(z.string().max(10000)),
  table: docxTableSchema.optional().nullable()
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

const docxPayloadSchema = z.object({
  docType: z.string().max(100).optional().nullable(),
  title: z.string().min(1).max(500).optional().nullable(),
  meta: z.string().max(500).optional().nullable(),
  author: z.string().max(200).optional().nullable(),
  specialty: z.string().max(100).optional().nullable(),
  pico: z.array(picoRowSchema).optional().nullable(),
  outcomes: z.array(z.string().max(500)).optional().nullable(),
  keywords: z.array(z.string().max(100)).optional().nullable(),
  sections: z.array(docxSectionSchema).optional().nullable(),
  references: z.array(z.string().max(2000)).optional().nullable(),
  retainedReferences: z.array(auditableRefSchema).optional().nullable(),
  citationStyle: z.enum(["vancouver", "apa", "harvard"]).optional().nullable(),
  workflow: workflowSchema.optional().nullable()
});

const BODY_MAX = 400_000;

function parseFormattedRuns(text: string, style: "vancouver" | "apa" | "harvard" = "vancouver"): TextRun[] {
  return parseFormattedDocxRuns(text, style);
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
      const buffer = await buildWorkflowDocx(body.workflow);
      const style = body.workflow.citationStyle || "vancouver";
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="aimed-evidence-summary-${style}.docx"`,
          "Cache-Control": "no-store"
        }
      });
    }

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
    const authorityGuidelines = specDef?.authorityGuidelines || "International Clinical Practice Guidelines & Consensus Statements";

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

    // Document Title (Title)
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { before: 120, after: 240 },
        children: [
          new TextRun({
            text: title.replace(/<[^>]*>/g, ""),
            font: "Arial",
            size: 38,
            bold: true,
            color: "0F172A"
          })
        ]
      })
    );

    // Draft Notice Callout
    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
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
                width: { size: 100, type: WidthType.PERCENTAGE },
                shading: { fill: "FEF3C7" },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: DRAFT_DISCLAIMER,
                        font: "Arial",
                        size: 18,
                        italics: true,
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

    // Metadata Table Box
    const metaRows: [string, string][] = [
      ...(body.author ? [["Author", String(body.author)] as [string, string]] : []),
      ["Clinical Specialty Domain", specialtyName],
      ["Authority Guidelines", authorityGuidelines],
      ["Synthesis Date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
      ["Citation & Style Protocol", styleLabel],
      ["Evidence Base Indexing", ALL_SOURCES_LABEL]
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
          heading: HeadingLevel.HEADING_1,
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
            new TextRun({ text: "Keywords: ", bold: true, font: "Arial", size: 21, color: "0F172A" }),
            new TextRun({ text: body.keywords.join("; "), italics: true, font: "Arial", size: 21, color: "475569" })
          ]
        })
      );
    }

    // Narrative Sections (Abstract, Introduction, Discussion, Conclusion)
    const createDocxTable = (headers: string[], rows: string[][]): Table => {
      const numCols = headers.length || 1;
      const colWidthPercent = Math.floor(100 / numCols);

      const headerRow = new TableRow({
        tableHeader: true,
        children: headers.map(h =>
          new TableCell({
            width: { size: colWidthPercent, type: WidthType.PERCENTAGE },
            shading: { fill: "0F172A" },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: h,
                    bold: true,
                    color: "FFFFFF",
                    font: "Arial",
                    size: 18
                  })
                ]
              })
            ]
          })
        )
      });

      const bodyRows = rows.map((row, rIdx) =>
        new TableRow({
          children: row.map(cell =>
            new TableCell({
              width: { size: colWidthPercent, type: WidthType.PERCENTAGE },
              shading: { fill: rIdx % 2 === 0 ? "FFFFFF" : "F8FAFC" },
              margins: { top: 90, bottom: 90, left: 140, right: 140 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                left: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                right: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: parseFormattedRuns(cell, style)
                })
              ]
            })
          )
        })
      );

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...bodyRows]
      });
    };

    if (Array.isArray(body.sections)) {
      const renderedTablesInBlocks = new Set<string>();
      for (const section of body.sections) {
        if (!section || !Array.isArray(section.blocks) || !section.blocks.length) continue;

        if (section.heading) {
          docChildren.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
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
                docChildren.push(createDocxTable(headers, rows));
                docChildren.push(new Paragraph({ spacing: { after: 180 } }));
                renderedTablesInBlocks.add(section.heading || "");
                continue;
              }
            }

            // Check heading
            if (/^#{1,4}\s+/.test(rawSub)) {
              const headTitle = rawSub.replace(/^#{1,4}\s+/, "").replace(/\*\*/g, "").replace(/<[^>]*>/g, "").trim();
              docChildren.push(
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
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

        if (section.table && Array.isArray(section.table.headers) && section.table.headers.length > 0 && !renderedTablesInBlocks.has(section.heading || "")) {
          docChildren.push(createDocxTable(section.table.headers, section.table.rows));
          docChildren.push(new Paragraph({ spacing: { after: 180 } }));
        }
      }
    }

    // References Section
    if (Array.isArray(body.references) && body.references.length) {
      docChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
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
            // Left-aligned: justifying a reference that ends in a long DOI and URL stretched the
            // spaces between the other words into wide gaps.
            alignment: AlignmentType.LEFT,
            indent: { left: 720, hanging: 720 },
            children: parseFormattedRuns(formattedEntry, style)
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
            text: getFooterText(),
            font: "Arial",
            size: 17,
            color: "64748B"
          })
        ]
      })
    );

    const doc = new Document({
      creator: body.author ? `${body.author} / AIMED` : "AIMED",
      title: title,
      description: `Scientific Commentary Working Draft: ${title}`,
      keywords: body.keywords?.join(", "),
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

    const suffix = body.docType && String(body.docType).toLowerCase().includes("question") ? "-question.docx" : "-manuscript.docx";
    return new NextResponse(new Uint8Array(docxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safe}${suffix}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    console.error("DOCX generation failed:", e);
    return NextResponse.json({ error: "DOCX generation failed. Please retry." }, { status: 500 });
  }
}
