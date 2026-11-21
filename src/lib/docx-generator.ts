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
  BorderStyle
} from "docx";
import type { WorkflowExportData } from "./summary-payload.ts";

export async function buildWorkflowDocx(workflow: WorkflowExportData): Promise<Buffer> {
  const docChildren: (Paragraph | Table)[] = [];

  // Title
  const titleText = workflow.title || workflow.phrase;
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: titleText,
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

  // Clinical Disclaimer Banner
  docChildren.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 24, color: "0F766E" },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: "F0FDFA" },
              margins: { top: 120, bottom: 120, left: 200, right: 160 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "EDUCATIONAL & CLINICAL DECISION-SUPPORT DISCLAIMER: ",
                      font: "Arial",
                      size: 18,
                      bold: true,
                      color: "0F766E"
                    }),
                    new TextRun({
                      text: "AIMed is an assistive clinical intelligence platform designed for evidence inquiry formulation. Synthesized claims, outcomes, and proposed questions require independent clinician verification against original peer-reviewed primary literature.",
                      font: "Arial",
                      size: 18,
                      color: "334155"
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
            children: [
              new TextRun({
                text: absSent,
                font: "Arial",
                size: 20,
                color: "334155"
              })
            ]
          })
        );
      }
    }

    // Manuscript Sections (Background, Search strategy and screening, Evidence synthesis, Limitations, Conclusion)
    for (const sec of workflow.sections) {
      docChildren.push(
        new Paragraph({
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
        docChildren.push(
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: p,
                font: "Arial",
                size: 20,
                color: "334155"
              })
            ]
          })
        );
      }
    }

    // References Section
    const styleLabel = (workflow.citationStyle || "vancouver").toUpperCase();
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

    if (workflow.references && workflow.references.length > 0) {
      for (const refLine of workflow.references) {
        docChildren.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: refLine,
                font: "Arial",
                size: 18,
                color: "1E293B"
              })
            ]
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

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren
      }
    ]
  });

  return await Packer.toBuffer(doc);
}
