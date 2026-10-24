import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  searchMultiSourceLiterature,
  buildSearchQuery,
  type LiteratureSource
} from "@/lib/literature-sources";

export const maxDuration = 60;

const literatureSchema = z.object({
  sources: z.array(z.enum(["pubmed", "pmc", "semanticscholar", "openalex", "crossref"])).optional().default(["pubmed", "pmc", "semanticscholar", "openalex", "crossref"]),
  query: z.string().max(500).optional().nullable(),
  population: z.string().max(500).optional().nullable(),
  intervention: z.string().max(500).optional().nullable(),
  comparator: z.string().max(500).optional().nullable(),
  outcome: z.string().max(500).optional().nullable(),
  maxResults: z.number().int().min(1).max(50).optional().default(12)
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ results: [], error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = literatureSchema.safeParse(json);
  if (!parseResult.success) {
    return NextResponse.json(
      { results: [], error: "Invalid parameters: " + parseResult.error.issues.map(e => e.message).join(", ") },
      { status: 400 }
    );
  }

  const body = parseResult.data;
  const term = buildSearchQuery(body);

  if (!term.trim()) {
    return NextResponse.json({ results: [], error: "Provide at least one search term or PICO element." }, { status: 400 });
  }

  const sources: LiteratureSource[] = body.sources.length > 0
    ? body.sources
    : ["pubmed", "pmc", "semanticscholar", "openalex", "crossref"];

  try {
    const results = await searchMultiSourceLiterature({
      sources,
      query: term,
      maxResults: body.maxResults
    });

    return NextResponse.json({
      results,
      term,
      sources,
      count: results.length
    });
  } catch (err) {
    console.error("[literature] search error:", err);
    return NextResponse.json(
      { results: [], error: "Multi-source literature search failed. Please retry." },
      { status: 502 }
    );
  }
}
