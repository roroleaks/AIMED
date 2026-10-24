import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchCrossrefArticles, buildSearchQuery } from "@/lib/literature-sources";

export const maxDuration = 60;

const crossrefSchema = z.object({
  query: z.string().max(500).optional().nullable(),
  population: z.string().max(500).optional().nullable(),
  intervention: z.string().max(500).optional().nullable(),
  comparator: z.string().max(500).optional().nullable(),
  outcome: z.string().max(500).optional().nullable(),
  maxResults: z.number().int().min(1).max(50).optional().default(8)
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ results: [], error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = crossrefSchema.safeParse(json);
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

  try {
    const results = await fetchCrossrefArticles(term, body.maxResults);
    return NextResponse.json({
      results,
      term,
      count: results.length,
      source: "crossref"
    });
  } catch (err) {
    console.error("[crossref] API endpoint error:", err);
    return NextResponse.json(
      { results: [], error: "CrossRef scientific search failed. Please retry." },
      { status: 502 }
    );
  }
}
