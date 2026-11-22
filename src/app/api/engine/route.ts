import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AuditableRef } from "@/lib/relevance";
import { generateDeterministicScreen, validateScreenRequest, isAmbiguousOrNonClinicalInput } from "@/lib/deterministic-screen";
import { validateExploreRequest, scoreRecords, type ExploreRecord } from "@/lib/explore-scoring";
import {
  composeManuscript,
  validateEnrichedManuscript,
  validateComposeRequest,
  type ComposeStageInput,
  type SearchLogEntry
} from "@/lib/manuscript-composer";
import type { PicoWord } from "@/lib/pico-roles";
import { getSpecialtyDefinition } from "@/lib/specialties";
import { buildCandidates, getPublicationTypeFilter } from "@/lib/pubmed-query";
import { signRecord, verifyRecordSignature } from "@/lib/record-signature";
import {
  decodeHtmlEntities,
  fetchFromSource,
  isNonEvidenceTitle,
  articleIdentityKeys,
  ncbiSlot,
  noteNcbiThrottle,
  isSourceCoolingDown,
  noteSourceFailure,
  ALL_LITERATURE_SOURCES,
  type LiteratureSource,
  type LiteratureArticle,
  resetSourceStatus,
  sourceStatusSnapshot,
  recordSourceStatus
} from "@/lib/literature-sources";

export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const KEY = GEMINI_API_KEY || GROQ_API_KEY || OPENROUTER_API_KEY || OPENAI_API_KEY;

function hasAnyLlmKey(): boolean {
  return !!KEY;
}

const MODEL = process.env.LLM_MODEL || "gemini-2.0-flash";

// Bounded timeouts so dependencies degrade gracefully within request budget
const LLM_TIMEOUT_MS = 25_000;
const API_TIMEOUT_MS = 4_000;

class LlmFatal extends Error {}
class LlmTransient extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

// 4xx (other than 429) will never succeed on retry: bad key, bad request, wrong model.
const LLM_NON_RETRYABLE = new Set([400, 401, 403, 404, 422]);

function cleanJsonResponse(raw: string): Record<string, unknown> {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Could not parse JSON response: " + raw.slice(0, 100));
  }
}

function validateScreenLlmResponse(
  raw: Record<string, unknown>,
  words: PicoWord[]
): {
  established: { phrase: string; basis: string };
  conflicting: { phrase: string; basis: string };
  gap: { phrase: string; basis: string };
} | null {
  try {
    const categories = ["established", "conflicting", "gap"] as const;
    const result: Record<string, { phrase: string; basis: string }> = {};

    for (const cat of categories) {
      const entry = raw[cat] as { phrase?: unknown; basis?: unknown } | undefined;
      if (!entry || typeof entry.phrase !== "string" || typeof entry.basis !== "string") {
        return null;
      }
      const phrase = entry.phrase.trim();
      const basis = entry.basis.trim();

      if (!phrase || !basis) return null;
      if (basis.length > 400) return null;

      // Must contain all 4 markers
      const markers = ["(P)", "(I)", "(C)", "(O)"];
      for (const m of markers) {
        if (!phrase.includes(m)) return null;
      }

      // Must cover all submitted words
      const lowerPhrase = phrase.toLowerCase();
      for (const w of words) {
        if (!lowerPhrase.includes(w.word.trim().toLowerCase())) {
          return null;
        }
      }

      result[cat] = { phrase, basis };
    }

    // Check pairwise distinct
    const pSet = new Set([result.established.phrase, result.conflicting.phrase, result.gap.phrase]);
    if (pSet.size !== 3) return null;

    return result as {
      established: { phrase: string; basis: string };
      conflicting: { phrase: string; basis: string };
      gap: { phrase: string; basis: string };
    };
  } catch {
    return null;
  }
}

async function callGemini(modelName: string, apiKey: string, system: string, payload: unknown): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: `${system}\n\nInput:\n${JSON.stringify(payload)}` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new LlmTransient(`Gemini rate limited: ${body}`, 5000);
    if (LLM_NON_RETRYABLE.has(res.status)) throw new LlmFatal(`Gemini fatal ${res.status}: ${body}`);
    throw new LlmTransient(`Gemini HTTP ${res.status}: ${body}`, 2000);
  }
  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new LlmTransient("Gemini returned empty candidate", 1000);
  return cleanJsonResponse(rawText);
}

async function callOpenAiCompatible(url: string, apiKey: string, model: string, system: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new LlmTransient(`Provider rate limited: ${body}`, 5000);
    if (LLM_NON_RETRYABLE.has(res.status)) throw new LlmFatal(`Provider fatal ${res.status}: ${body}`);
    throw new LlmTransient(`Provider HTTP ${res.status}: ${body}`, 2000);
  }
  const data = await res.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new LlmTransient("Provider returned empty choice", 1000);
  return cleanJsonResponse(rawText);
}

async function callLLM(system: string, payload: unknown, attempts = 2): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (GEMINI_API_KEY) {
        return await callGemini(MODEL, GEMINI_API_KEY, system, payload);
      }
      if (GROQ_API_KEY) {
        return await callOpenAiCompatible("https://api.groq.com/openai/v1/chat/completions", GROQ_API_KEY, "llama-3.3-70b-versatile", system, payload);
      }
      if (OPENROUTER_API_KEY) {
        return await callOpenAiCompatible("https://openrouter.ai/api/v1/chat/completions", OPENROUTER_API_KEY, "anthropic/claude-3.5-haiku", system, payload);
      }
      if (OPENAI_API_KEY) {
        return await callOpenAiCompatible("https://api.openai.com/v1/chat/completions", OPENAI_API_KEY, "gpt-4o-mini", system, payload);
      }
      throw new LlmFatal("No LLM API key configured");
    } catch (err) {
      lastErr = err;
      if (err instanceof LlmFatal) throw err;
      if (attempt + 1 < attempts) {
        const delay = err instanceof LlmTransient ? err.retryAfterMs : 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }
  throw lastErr;
}

interface PubMedRef {
  pmid: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi?: string;
  url?: string;
  context?: string;
  source?: string;
  pubType?: string;
  publicationTypes?: string[];
}

interface ESummaryDoc {
  title?: string;
  sortfirstauthor?: string;
  authors?: Array<{ name?: string; authtype?: string }>;
  pubdate?: string;
  fulljournalname?: string;
  source?: string;
  elocationid?: string;
  pubtype?: string[];
}

// Identity keys shared with the literature library: DOI, numeric PMID, provider id and folded
// title. The same paper from two providers shares at least one key, so it is never listed twice.
function refKeys(r: PubMedRef): string[] {
  return articleIdentityKeys(r);
}

/** True when any identity key of this reference has already been used. */
function isUsedRef(r: PubMedRef, used: Set<string>): boolean {
  if (r.pmid && used.has(r.pmid)) return true;
  return refKeys(r).some(k => used.has(k));
}



function libToRef(a: LiteratureArticle): PubMedRef {
  return {
    pmid: a.pmid,
    title: a.title,
    authors: a.authors,
    year: a.year,
    journal: a.journal,
    doi: a.doi,
    url: a.url,
    source: a.source,
    pubType: a.pubType,
    publicationTypes: a.publicationTypes,
    context: a.context
  };
}

/**
 * One fetch per MANDATORY source. PubMed uses the engine's own richer fetcher (abstracts and
 * review/RCT boosting); every other source uses the library, which applies source cooldowns.
 */
function fetchAllSources(
  query: string,
  maxResults: number,
  excluded: Set<string>,
  questionType?: string,
  interventionToken?: string,
  lite = false,
  picoInput?: { population?: string; intervention?: string; comparator?: string; outcome?: string }
): Promise<PubMedRef[]>[] {
  return ALL_LITERATURE_SOURCES.map((src: LiteratureSource) => {
    if (src === "pubmed") return fetchPubMedReferences(query, lite ? maxResults * 2 : maxResults, excluded, questionType, interventionToken, lite, picoInput).catch(() => []);
    const extQuery = picoInput
      ? [picoInput.population, picoInput.intervention || picoInput.comparator, picoInput.outcome].filter(Boolean).join(" ")
      : query;
    return fetchFromSource(src, extQuery, maxResults, questionType).then(arts => arts.map(libToRef)).catch(() => []);
  });
}

function dedupeRefs(refs: PubMedRef[]): PubMedRef[] {
  const seen = new Set<string>();
  const out: PubMedRef[] = [];
  for (const r of refs) {
    if (!(r.title || "").trim()) continue;
    const keys = refKeys(r);
    if (keys.length && keys.some(k => seen.has(k))) continue;
    keys.forEach(k => seen.add(k));
    out.push(r);
  }
  return out;
}

const NCBI_API_KEY = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY || "";

async function esearchIds(term: string, retmax: number, filters = ""): Promise<string[]> {
  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : "";
  await ncbiSlot();
  const res = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term + filters)}&retmax=${retmax}&retmode=json${apiKeyParam}`,
    { signal: AbortSignal.timeout(API_TIMEOUT_MS) }
  );
  if (!res.ok) {
    if (res.status === 429) noteNcbiThrottle();
    return [];
  }
  const data = await res.json();
  return (data?.esearchresult?.idlist || []).filter((id: string) => /^\d+$/.test(id));
}

async function esummaryForIds(ids: string[]): Promise<Record<string, ESummaryDoc>> {
  if (!ids.length) return {};
  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : "";
  await ncbiSlot();
  const res = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json${apiKeyParam}`,
    { signal: AbortSignal.timeout(API_TIMEOUT_MS) }
  );
  if (!res.ok) {
    if (res.status === 429) noteNcbiThrottle();
    return {};
  }
  const data = await res.json();
  return (data?.result || {}) as Record<string, ESummaryDoc>;
}

async function efetchAbstracts(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : "";
  try {
    await ncbiSlot();
    const res = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml${apiKeyParam}`,
      { signal: AbortSignal.timeout(API_TIMEOUT_MS) }
    );
    if (!res.ok) {
      if (res.status === 429) noteNcbiThrottle();
      return out;
    }
    const xml = await res.text();
    const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
    let match: RegExpExecArray | null;
    while ((match = articleRegex.exec(xml)) !== null) {
      const art = match[1];
      const pmidMatch = art.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      if (!pmidMatch) continue;
      const pmid = pmidMatch[1];
      const absParts: string[] = [];
      const absTextRegex = /<AbstractText(?:\s+Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g;
      let absMatch: RegExpExecArray | null;
      while ((absMatch = absTextRegex.exec(art)) !== null) {
        const label = absMatch[1];
        const text = decodeHtmlEntities(absMatch[2]);
        absParts.push(label ? `${label}: ${text}` : text);
      }
      if (absParts.length) {
        out.set(pmid, absParts.join(" "));
      }
    }
  } catch {}
  return out;
}

async function fetchPubMedReferences(
  topic: string,
  maxResults = 8,
  excluded: Set<string> = EMPTY_REF_SET,
  questionType = "Therapy / Prevention",
  interventionToken = "",
  lite = false,
  picoInput?: { population?: string; intervention?: string; comparator?: string; outcome?: string }
): Promise<PubMedRef[]> {
  const t0 = Date.now();
  if (isSourceCoolingDown("pubmed")) {
    recordSourceStatus("pubmed", { attempted: false, ok: false, skipped: "cooldown", hits: 0, ms: 0 });
    return [];
  }

  // Iterate the recall ladder with multi-arm search (SR/MA/Guidelines + RCTs + unfiltered)
  const candidateLadder = buildCandidates({
    population: picoInput?.population || topic,
    intervention: picoInput?.intervention || interventionToken,
    comparator: picoInput?.comparator,
    outcome: picoInput?.outcome,
    questionType: null
  });

  const candidatesToTry = candidateLadder.length > 0 ? candidateLadder : [topic];
  const ptFilter = getPublicationTypeFilter(questionType);

  let rawIds: string[] = [];
  let termUsed = "";

  try {
    for (const cand of candidatesToTry) {
      if (!cand) continue;
      // Arm 1: Evidence synthesis and trials (SR/MA/RCT)
      const arm1Term = ptFilter ? `${cand} AND ${ptFilter}` : cand;
      const arm1Ids = await esearchIds(arm1Term, maxResults * 3);
      if (arm1Ids.length > 0) {
        rawIds = arm1Ids;
        termUsed = arm1Term;
        break;
      }
      // Arm 2: Unfiltered clinical studies (observational/prognostic/emerging topics)
      const arm2Term = `${cand} NOT ("study protocol"[Publication Type] OR "clinical trial protocol"[Publication Type] OR "editorial"[Publication Type] OR "letter"[Publication Type] OR "news"[Publication Type])`;
      const arm2Ids = await esearchIds(arm2Term, maxResults * 3);
      if (arm2Ids.length > 0) {
        rawIds = arm2Ids;
        termUsed = arm2Term;
        break;
      }
    }

    if (rawIds.length === 0 && topic && topic !== termUsed) {
      rawIds = await esearchIds(topic, maxResults * 2);
      termUsed = topic;
    }

    const freshIds = rawIds.filter(id => !excluded.has(id));
    if (!freshIds.length) {
      recordSourceStatus("pubmed", {
        attempted: true,
        ok: true,
        skipped: "none",
        hits: 0,
        ms: Date.now() - t0,
        query: termUsed,
        date: new Date().toISOString().slice(0, 10)
      });
      return [];
    }
    const candidateIds = freshIds.slice(0, maxResults * 2);
    const summaries = await esummaryForIds(candidateIds);
    const scoredIds = candidateIds
      .filter(id => {
        const doc = summaries[id];
        return doc && (doc.title || "").trim().length > 0;
      })
      .map(id => {
        const doc = summaries[id]!;
        const types = (doc.pubtype || []).map(t => t.toLowerCase());
        let boost = 0;
        if (types.some(t => t.includes("systematic review") || t.includes("meta-analysis"))) boost += 4;
        else if (types.some(t => t.includes("randomized controlled trial"))) boost += 3;
        else if (types.some(t => t.includes("clinical trial"))) boost += 2;
        else if (types.some(t => t.includes("review"))) boost += 1;
        return { id, boost };
      })
      .sort((a, b) => b.boost - a.boost)
      .map(s => s.id)
      .slice(0, maxResults);

    const abstractIds = lite ? scoredIds.slice(0, Math.min(2, scoredIds.length)) : scoredIds;
    const abstracts = await efetchAbstracts(abstractIds);

    const refs: PubMedRef[] = [];
    for (const id of scoredIds) {
      const doc = summaries[id];
      if (!doc || !doc.title) continue;
      const title = decodeHtmlEntities(doc.title.replace(/\.$/, "").trim());
      const authorList = doc.authors || [];
      let authors = "";
      if (authorList.length === 1) {
        authors = authorList[0]?.name || doc.sortfirstauthor || "";
      } else if (authorList.length === 2) {
        authors = `${authorList[0]?.name || ""}, ${authorList[1]?.name || ""}`;
      } else if (authorList.length > 2) {
        authors = `${authorList[0]?.name || doc.sortfirstauthor || ""}, et al`;
      } else {
        authors = doc.sortfirstauthor || "Unknown";
      }
      const year = (doc.pubdate || "").match(/\b(19\d\d|20\d\d)\b/)?.[1] || "";
      const journal = doc.fulljournalname || doc.source || "PubMed";
      const doi = (doc.elocationid || "").match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/)?.[0] || "";
      const rawPubType = (doc.pubtype || [])[0] || "";
      const cleanPubType = rawPubType.replace(/^Journal Article$/i, "");
      const context = abstracts.get(id) || "";
      refs.push({
        pmid: id,
        title,
        authors,
        year,
        journal,
        doi,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        context,
        source: "pubmed",
        pubType: cleanPubType || undefined,
        publicationTypes: doc.pubtype || []
      });
    }

    const filtered = refs
      .filter(r => !isUsedRef(r, excluded))
      .filter(r => r.title.length > 0 && !isNonEvidenceTitle(r.title));

    recordSourceStatus("pubmed", {
      attempted: true,
      ok: true,
      skipped: "none",
      hits: filtered.length,
      ms: Date.now() - t0,
      query: termUsed,
      date: new Date().toISOString().slice(0, 10)
    });
    return filtered;
  } catch (err) {
    noteSourceFailure("pubmed", err instanceof Error ? err.message : String(err));
    recordSourceStatus("pubmed", {
      attempted: true,
      ok: false,
      skipped: "none",
      hits: 0,
      ms: Date.now() - t0,
      query: termUsed,
      date: new Date().toISOString().slice(0, 10),
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

async function fetchReferencesBroad(
  query: string,
  maxResults = 8,
  excluded: Set<string> = EMPTY_REF_SET,
  questionType?: string,
  interventionToken?: string,
  picoInput?: { population?: string; intervention?: string; comparator?: string; outcome?: string }
): Promise<PubMedRef[]> {
  const fetched = await Promise.allSettled(fetchAllSources(query, maxResults, excluded, questionType, interventionToken, false, picoInput));
  const pool: PubMedRef[] = [];
  for (const f of fetched) {
    if (f.status === "fulfilled") {
      pool.push(...f.value);
    }
  }
  const merged = dedupeRefs(pool.filter(r => !isUsedRef(r, excluded)));
  const want = Math.max(maxResults, 6);
  const byScore = (r: PubMedRef): number => {
    let s = r.pmid && /^\d+$/.test(r.pmid) ? 2 : 0;
    s += r.doi ? 1 : 0;
    s += r.context ? 1 : 0;
    return s;
  };
  const bySource = (r: PubMedRef): string => {
    if (r.source) return r.source;
    if (/^\d+$/.test(r.pmid)) return "pubmed";
    if (/^(pmc|epmc):/i.test(r.pmid)) return "pmc";
    if (/^s2:/i.test(r.pmid)) return "semanticscholar";
    if (/^oax:/i.test(r.pmid)) return "openalex";
    if (/^cr:/i.test(r.pmid)) return "crossref";
    if (/^gs:/i.test(r.pmid)) return "googlescholar";
    if (/^doaj:/i.test(r.pmid)) return "doaj";
    if (/^nct:/i.test(r.pmid)) return "clinicaltrials";
    if (/^cochrane:/i.test(r.pmid)) return "cochrane";
    if (/^ppr:/i.test(r.pmid)) return "preprints";
    return "other";
  };

  const bySrc = new Map<string, PubMedRef[]>();
  for (const r of merged) {
    const src = bySource(r);
    if (!bySrc.has(src)) bySrc.set(src, []);
    bySrc.get(src)!.push(r);
  }
  for (const list of bySrc.values()) {
    list.sort((a, b) => byScore(b) - byScore(a));
  }

  const distinctSources = bySrc.size;
  const maxPubMed = distinctSources >= 2 ? Math.ceil(want / 2) : want;
  const picked: PubMedRef[] = [];
  const pickedKeys = new Set<string>();

  const tryAdd = (r: PubMedRef): boolean => {
    const key = r.doi || r.pmid || r.title.toLowerCase();
    if (!pickedKeys.has(key)) {
      pickedKeys.add(key);
      picked.push(r);
      return true;
    }
    return false;
  };

  let pubMedCount = 0;
  let maxLen = 0;
  for (const list of bySrc.values()) {
    if (list.length > maxLen) maxLen = list.length;
  }

  for (let idx = 0; idx < maxLen && picked.length < want; idx++) {
    for (const [src, list] of bySrc.entries()) {
      if (picked.length >= want) break;
      if (idx < list.length) {
        if (src === "pubmed" && pubMedCount >= maxPubMed) {
          continue;
        }
        const candidate = list[idx];
        if (tryAdd(candidate)) {
          if (src === "pubmed") pubMedCount++;
        }
      }
    }
  }

  if (picked.length < want) {
    for (const list of bySrc.values()) {
      for (const r of list) {
        if (picked.length >= want) break;
        tryAdd(r);
      }
    }
  }

  return picked.slice(0, want);
}

const EMPTY_REF_SET = new Set<string>();

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stageSchema = z.object({
    stage: z.enum(["screen", "explore", "compose"]),
  });

  const baseResult = stageSchema.safeParse(body);
  if (!baseResult.success) {
    return NextResponse.json(
      { error: "Invalid stage parameter: " + baseResult.error.issues.map(e => e.message).join(", ") },
      { status: 400 }
    );
  }
  const stage = baseResult.data.stage;

  if (stage === "screen") {
    const val = validateScreenRequest(body);
    if (!val.ok) {
      return NextResponse.json({ error: val.error }, { status: val.status });
    }
  } else if (stage === "explore") {
    const val = validateExploreRequest(body);
    if (!val.ok) {
      return NextResponse.json({ error: val.error }, { status: val.status });
    }
  } else if (stage === "compose") {
    const val = validateComposeRequest(body);
    if (!val.ok) {
      return NextResponse.json({ error: val.error }, { status: val.status });
    }
  }

  try {
    if (stage === "screen") {
      resetSourceStatus();
      const { words, specialty } = body as { words: PicoWord[]; specialty: string };
      const ambCheck = isAmbiguousOrNonClinicalInput(words);
      if (ambCheck.ambiguous) {
        return NextResponse.json({
          needsClarification: true,
          message: ambCheck.reason || "Input is ambiguous or non-clinical. Please specify the target population, intervention, and measurable clinical endpoint.",
          phrases: null,
          corpusStats: { retrieved: 0, screened: 0, relaxationLevel: 0 },
          sources: []
        }, { status: 200 });
      }

      const specDef = getSpecialtyDefinition(specialty)!;

      // 1. Deterministic base computed first
      let screenPayload = generateDeterministicScreen(words);

      // 2. Retrieval: build queries conditioned with structured PICO and retrieve through multi-source machinery
      let corpus: AuditableRef[] = [];
      let totalRetrieved = 0;
      let relaxationLevel: 0 | 1 | 2 = 0;
      try {
        const queryTerms = words.map(w => w.word.trim()).filter(Boolean);
        const query = queryTerms.join(" ");
        const popWord = words.find(w => w.role === "population")?.word || "";
        const primaryI = words.find(w => w.role === "intervention")?.word || "";
        const compWord = words.find(w => w.role === "comparator")?.word || "";
        const outWord = words.find(w => w.role === "outcome")?.word || "";
        const picoInput = { population: popWord, intervention: primaryI, comparator: compWord, outcome: outWord };

        console.log(`[engine] screen retrieval attempt (level 0): "${query}" (intervention: "${primaryI}")`);
        const fetched = await fetchReferencesBroad(query, 25, EMPTY_REF_SET, "Therapy / Prevention", primaryI, picoInput);
        corpus = fetched.slice(0, 30);
        totalRetrieved = fetched.length;

        // Task 5: retrieval relaxation when query yields 0 records - preserve population, never drop or substitute
        if (corpus.length === 0) {
          relaxationLevel = 1;
          const cleanTerm = (t: string) => t.replace(/['’]s\b/gi, "").replace(/['’]/g, "").trim();
          const cleanPop = cleanTerm(popWord || queryTerms[0] || "");
          const cleanInt = cleanTerm(primaryI || queryTerms[1] || "");
          const relaxedQuery = [cleanPop, cleanInt].filter(Boolean).join(" ");
          const relaxedPico = { population: cleanPop, intervention: cleanInt };
          console.log(`[engine] screen retrieval zero hits, retrying relaxed (level 1): "${relaxedQuery}"`);
          const relaxedFetched = await fetchReferencesBroad(relaxedQuery, 25, EMPTY_REF_SET, "Therapy / Prevention", cleanInt, relaxedPico);
          corpus = relaxedFetched.slice(0, 30);
          totalRetrieved = relaxedFetched.length;
        }
      } catch (fetchErr) {
        console.warn("[engine] screen literature retrieval failed:", fetchErr);
      }

      // Compute deterministic screen grounded in retrieved corpus if available
      if (corpus.length > 0) {
        screenPayload = generateDeterministicScreen(words, corpus, relaxationLevel, totalRetrieved);
      }
      let aiRefined = false;

      // 3. Optional AI refinement
      if (hasAnyLlmKey()) {
        try {
          const corpusDigest = corpus
            .slice(0, 15)
            .map((r, i) => `[${i + 1}] ${r.title}\n${(r.context || "").slice(0, 300)}`)
            .join("\n\n");

          const systemPrompt = `You are a clinical literature screening engine for Evidence-Based Medicine specializing in ${specDef.label}. ${specDef.systemPromptRole}

TASK: Based on the screened literature digest and clinical PICO words, refine the 3 main PICO phrases (one established knowledge, one conflicting evidence, one research gap) for clinical naturalness.

CLINICAL PICO WORDS:
${words.map(w => `- ${w.role.toUpperCase()}: ${w.word}`).join("\n")}

SCREENED LITERATURE DIGEST (${corpus.length} records):
${corpusDigest || "(No records retrieved matching exact query)"}

HARD RULES:
1. Standard medical spelling and terminology ONLY.
2. EXACTLY 3 phrases — one "established", one "conflicting", one "gap".
3. Each phrase MUST be a single question sentence in strict PICO format with literal (P), (I), (C), and (O) markers:
   "In [Population] (P), does [Intervention] (I) compared with [Comparator] (C) affect [Outcome] (O)?"
   - (P) must contain the population parameter.
   - (I) must contain the evaluated intervention.
   - (C) must contain the comparator (e.g. usual care, placebo, or specified control).
   - (O) must contain the clinical endpoint or outcome.
4. Each phrase MUST have a 1-2 sentence "basis" that ONLY references findings or evidence patterns present in the provided corpus digest (or explicitly notes absence/scarcity of evidence for the gap). Maximum 400 characters per basis.
5. All 3 phrases MUST be pairwise distinct.
6. Word coverage: Every submitted PICO word must appear in the phrases or bases. Do not invent ungrounded clinical terms.
7. Respond ONLY with valid JSON, no markdown formatting, no preamble:
{
  "established": { "phrase": "...", "basis": "..." },
  "conflicting": { "phrase": "...", "basis": "..." },
  "gap": { "phrase": "...", "basis": "..." }
}`;

          const rawLlm = await callLLM(systemPrompt, { words, specialty }, 1);
          const validated = validateScreenLlmResponse(rawLlm, words);
          if (validated) {
            screenPayload = {
              inputWords: words.map(w => w.word),
              source: "ai",
              phrases: {
                established: {
                  category: "established",
                  phrase: validated.established.phrase,
                  basis: validated.established.basis,
                  supported: screenPayload.phrases.established.supported,
                  unavailableReason: screenPayload.phrases.established.unavailableReason
                },
                conflicting: {
                  category: "conflicting",
                  phrase: validated.conflicting.phrase,
                  basis: validated.conflicting.basis,
                  supported: screenPayload.phrases.conflicting.supported,
                  unavailableReason: screenPayload.phrases.conflicting.unavailableReason
                },
                gap: {
                  category: "gap",
                  phrase: validated.gap.phrase,
                  basis: validated.gap.basis,
                  supported: screenPayload.phrases.gap.supported,
                  unavailableReason: screenPayload.phrases.gap.unavailableReason
                }
              },
              corpusStats: {
                retrieved: totalRetrieved,
                screened: corpus.length,
                relaxationLevel: 0
              }
            };
            aiRefined = true;
          }
        } catch (llmErr) {
          console.warn("[engine] LLM screen analysis failed, using deterministic fallback:", llmErr);
        }
      }

      const snap = sourceStatusSnapshot();
      const sources = ALL_LITERATURE_SOURCES.map(src => {
        const st = snap[src];
        return {
          id: src,
          ok: Boolean(st?.ok),
          count: Number(st?.hits || 0)
        };
      });

      return NextResponse.json({
        phrases: screenPayload.phrases,
        corpusStats: screenPayload.corpusStats,
        aiRefined,
        sources
      }, {
        headers: { "x-aimed-source": aiRefined ? "ai" : "deterministic" }
      });
    }

    if (stage === "explore") {
      resetSourceStatus();
      const { choice, words, excluded } = body as {
        choice: { category: "established" | "conflicting" | "gap"; phrase: string };
        words: PicoWord[];
        specialty?: string;
        excluded?: { userExcluded?: string[]; seen?: string[] };
      };
      const userExcluded = Array.isArray(excluded?.userExcluded) ? excluded!.userExcluded! : [];
      const seen = Array.isArray(excluded?.seen) ? excluded!.seen! : [];
      const blockedKeys = [...userExcluded, ...seen];

      let corpus: AuditableRef[] = [];
      let totalRetrieved = 0;
      let relaxationLevel: 0 | 1 | 2 = 0;

      const popWord = words.find(w => w.role === "population")?.word || "";
      const primaryI = words.find(w => w.role === "intervention")?.word || "";
      const compWord = words.find(w => w.role === "comparator")?.word || "";
      const outWord = words.find(w => w.role === "outcome")?.word || "";
      const picoInput = { population: popWord, intervention: primaryI, comparator: compWord, outcome: outWord };

      const queryTerms = words.map(w => w.word.trim()).filter(Boolean);
      const mainQuery = queryTerms.join(" ");

      try {
        const fetched = await fetchReferencesBroad(mainQuery, 30, EMPTY_REF_SET, "Therapy / Prevention", primaryI, picoInput);
        corpus = fetched;
        totalRetrieved = fetched.length;
      } catch (fetchErr) {
        console.warn("[engine] explore primary literature retrieval failed:", fetchErr);
      }

      let scoredResult = scoreRecords(corpus, choice.phrase, choice.category, blockedKeys);
      let surviving = scoredResult.scored.filter(r => r.relevancePct >= 15);

      // Relaxation level 1: if fewer than 10 records survive, broaden with core terms preserving population
      if (surviving.length < 10) {
        relaxationLevel = 1;
        try {
          const cleanTerm = (t: string) => t.replace(/['’]s\b/gi, "").replace(/['’]/g, "").trim();
          const cleanPop = cleanTerm(popWord || queryTerms[0] || "");
          const cleanInt = cleanTerm(primaryI || queryTerms[1] || "");
          const relaxPico = { population: cleanPop, intervention: cleanInt };
          const relaxTerms = [cleanPop, cleanInt].filter(Boolean);
          const relaxQuery = relaxTerms.join(" ");
          const relaxFetched = await fetchReferencesBroad(relaxQuery, 20, EMPTY_REF_SET, "Therapy / Prevention", primaryI, relaxPico);
          const merged = dedupeRefs([...(corpus as PubMedRef[]), ...relaxFetched]);
          corpus = merged;
          totalRetrieved = merged.length;
          scoredResult = scoreRecords(corpus, choice.phrase, choice.category, blockedKeys);
          surviving = scoredResult.scored.filter(r => r.relevancePct >= 15);
        } catch (relaxErr) {
          console.warn("[engine] explore relaxation level 1 failed:", relaxErr);
        }
      }

      // Relaxation level 2: if still fewer than 10, broaden with population and outcome
      if (surviving.length < 10 && outWord) {
        relaxationLevel = 2;
        try {
          const cleanTerm = (t: string) => t.replace(/['’]s\b/gi, "").replace(/['’]/g, "").trim();
          const cleanPop = cleanTerm(popWord || queryTerms[0] || "");
          const relaxPico = { population: cleanPop, outcome: outWord };
          const relaxQuery = [cleanPop, outWord].filter(Boolean).join(" ");
          const relaxFetched = await fetchReferencesBroad(relaxQuery, 20, EMPTY_REF_SET, "Therapy / Prevention", primaryI, relaxPico);
          const merged = dedupeRefs([...(corpus as PubMedRef[]), ...relaxFetched]);
          corpus = merged;
          totalRetrieved = merged.length;
          scoredResult = scoreRecords(corpus, choice.phrase, choice.category, blockedKeys);
          surviving = scoredResult.scored.filter(r => r.relevancePct >= 15);
        } catch (relaxErr) {
          console.warn("[engine] explore relaxation level 2 failed:", relaxErr);
        }
      }

      // Sign records before returning to establish server-side trust boundary
      const returnedRecords = surviving.slice(0, 20).map(r => signRecord(r));
      const hasMore = surviving.length > 20 || scoredResult.removedByBlock > 0 || relaxationLevel > 0;

      const snap = sourceStatusSnapshot();
      const sources = ALL_LITERATURE_SOURCES.map(src => {
        const st = snap[src];
        return {
          id: src,
          ok: Boolean(st?.ok),
          count: Number(st?.hits || 0)
        };
      });

      return NextResponse.json({
        records: returnedRecords,
        corpusStats: {
          retrieved: totalRetrieved,
          screened: scoredResult.scored.length + scoredResult.removedByBlock,
          blocked: scoredResult.removedByBlock,
          returned: returnedRecords.length,
          relaxationLevel
        },
        sources,
        hasMore
      }, {
        headers: { "x-aimed-source": "deterministic" }
      });
    }

    if (stage === "compose") {
      const {
        words,
        specialty,
        choice,
        screeningStats,
        records = [],
        userExcluded,
        style,
        searchLog
      } = body as ComposeStageInput;

      // Verify server-side trust boundary: reject fabricated or untrusted records
      if (records && records.length > 0) {
        for (const r of records as Array<Partial<ExploreRecord> & { _sig?: string }>) {
          const verified = verifyRecordSignature(r);
          if (!verified) {
            const hasValidPmid = !!(r.pmid && /^\d+$/.test(String(r.pmid).trim()));
            const hasValidDoi = !!(r.doi && /10\.\d{4,}\//.test(String(r.doi)));
            if (!hasValidPmid && !hasValidDoi) {
              return NextResponse.json(
                { error: "Untrusted or fabricated record detected: record signature verification failed and no resolvable identifier exists" },
                { status: 422 }
              );
            }
          }
        }
      }

      const stats = {
        retrieved: screeningStats?.retrieved ?? 0,
        screened: screeningStats?.screened ?? 0,
        relaxationLevel: screeningStats?.relaxationLevel ?? 0,
        excludedCount: screeningStats?.excludedCount ?? (userExcluded?.length ?? 0)
      };

      const deterministicManuscript = composeManuscript({
        words,
        category: choice.category,
        phrase: choice.phrase,
        screeningStats: stats,
        records: (records || []) as unknown as ExploreRecord[],
        userExcluded: userExcluded || [],
        specialty,
        style: style || "vancouver",
        searchLog: searchLog || (Array.isArray((body as Record<string, unknown>).sources) ? ((body as Record<string, unknown>).sources as SearchLogEntry[]) : undefined)
      });

      let finalManuscript = deterministicManuscript;

      if (hasAnyLlmKey()) {
        try {
          const specDef = getSpecialtyDefinition(specialty);
          const excludedSet = new Set((userExcluded || []).map(k => k.trim().toLowerCase()));
          const retained = (records as unknown as ExploreRecord[]).filter(r => {
            const pmidKey = (r.pmid || "").trim().toLowerCase();
            const doiKey = (r.doi || "").trim().toLowerCase();
            const titleKey = (r.title || "").trim().toLowerCase();
            return !excludedSet.has(pmidKey) && !excludedSet.has(doiKey) && !excludedSet.has(titleKey);
          });

          const prompt = `You are an expert scientific manuscript editor specialized in ${specDef.label}.
ROLE: ${specDef.systemPromptRole || "Academic medical editor"}
TASK: Improve the narrative prose flow, scholarly transitions, and clinical precision of the provided evidence synthesis draft.

STRICT EDITORIAL RULES:
1. Do NOT invent or fabricate any facts, findings, clinical outcomes, authors, years, journals, DOIs, numbers, or study sources.
2. Keep the EXACT section headings in this order:
   - "Background"
   - "Search strategy and screening"
   - "Evidence synthesis"
   - "Limitations"
   - "Conclusion"
3. In-text citation markers must be preserved and must point ONLY to the provided retained records.
4. Output zero hyperlinks, zero URLs, and zero "http" or "https" occurrences.
5. Keep total length within 0.5x to 1.75x of the input word count.
6. Return valid JSON only with this schema:
{
  "title": "...",
  "abstract": ["sentence 1", "sentence 2", "sentence 3", "sentence 4"],
  "sections": [
    { "heading": "Background", "paragraphs": ["..."] },
    { "heading": "Search strategy and screening", "paragraphs": ["..."] },
    { "heading": "Evidence synthesis", "paragraphs": ["..."] },
    { "heading": "Limitations", "paragraphs": ["..."] },
    { "heading": "Conclusion", "paragraphs": ["..."] }
  ]
}`;

          const userPayload = {
            manuscript: deterministicManuscript,
            retainedRecords: retained.map((r, idx) => ({
              index: idx + 1,
              title: r.title,
              authors: r.authors,
              year: r.year,
              journal: r.journal,
              doi: r.doi,
              pmid: r.pmid
            }))
          };

          const rawLlm = await callLLM(prompt, userPayload, 1);
          const validated = validateEnrichedManuscript(rawLlm, deterministicManuscript, retained, style || "vancouver");
          if (validated) {
            finalManuscript = validated;
          }
        } catch (llmErr) {
          console.warn("[engine] LLM compose enrichment failed, using deterministic fallback:", llmErr);
        }
      }

      return NextResponse.json(finalManuscript, {
        headers: { "x-aimed-source": finalManuscript.aiEnriched ? "ai" : "deterministic" }
      });
    }

    return NextResponse.json({ error: "Unsupported stage" }, { status: 400 });
  } catch (err) {
    console.error("[engine] fatal stage error:", err);
    if (stage === "screen") {
      try {
        const words = Array.isArray(body.words) ? (body.words as PicoWord[]) : [];
        if (words.length >= 3 && words.length <= 5) {
          const fallback = generateDeterministicScreen(words);
          return NextResponse.json({
            phrases: fallback.phrases,
            corpusStats: fallback.corpusStats,
            aiRefined: false,
            sources: ALL_LITERATURE_SOURCES.map(src => ({ id: src, ok: false, count: 0 }))
          });
        }
      } catch (fallbackError) {
        console.error(`[engine] fallback for "screen" also failed:`, fallbackError);
      }
    }
    if (stage === "explore") {
      try {
        return NextResponse.json({
          records: [],
          corpusStats: {
            retrieved: 0,
            screened: 0,
            blocked: 0,
            returned: 0,
            relaxationLevel: 0
          },
          sources: ALL_LITERATURE_SOURCES.map(src => ({ id: src, ok: false, count: 0 })),
          hasMore: false
        });
      } catch (fallbackError) {
        console.error(`[engine] fallback for "explore" also failed:`, fallbackError);
      }
    }
    if (stage === "compose") {
      try {
        const { words, specialty, choice, screeningStats, records, userExcluded, style } = body as ComposeStageInput;
        const stats = {
          retrieved: screeningStats?.retrieved ?? 0,
          screened: screeningStats?.screened ?? 0,
          relaxationLevel: screeningStats?.relaxationLevel ?? 0,
          excludedCount: screeningStats?.excludedCount ?? 0
        };
        const fallback = composeManuscript({
          words: words || [],
          category: choice?.category || "established",
          phrase: choice?.phrase || "",
          screeningStats: stats,
          records: (records || []) as unknown as ExploreRecord[],
          userExcluded: userExcluded || [],
          specialty: specialty || "obgyn",
          style: style || "vancouver"
        });
        return NextResponse.json(fallback, {
          headers: { "x-aimed-source": "deterministic" }
        });
      } catch (composeFallbackErr) {
        console.error(`[engine] fallback for compose also failed:`, composeFallbackErr);
      }
    }
    return NextResponse.json(
      { error: "The AI service is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}
