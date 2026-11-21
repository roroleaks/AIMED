import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { KB, QUESTION_TYPES, rationalOutcomes, type Analysis, type SpecialtyKey } from "@/lib/kb";
import { applyOutcomeAdvisory } from "@/lib/outcome-selection";
import { ruleAnalyze, ruleClarify, ruleFormulate } from "@/lib/rule-engine";
// Claim-specific filtering boundary. The engine imports these rather than keeping its own
// copy, so the rule the unit tests verify is the rule that gates commentary, the rendered
// reference list and every export.
import {
  auditRef,
  checkCitations,
  curateReferences,
  filterByClaim,
  resolveReference,
  selectedElements,
  reconcileNarrative,
  type PicoElement,
  type RefAudit
} from "@/lib/relevance";
// The no-key / provider-failure fallback lives in a module rather than inline in this route so it
// can be unit tested: the previous inline version shipped unverified, which is how it kept
// emitting hardcoded keywords and a fabricated "supports the evaluated comparison" claim.
import { generateDeterministicCommentary, buildTruthfulMethodsText } from "@/lib/deterministic-commentary";
// Confidence gate for LLM output evaluation and deterministic fallback telemetry
import { evaluateConfidence, shouldUseDeterministicFallback, createTelemetryEvent, DEFAULT_CONFIDENCE_CONFIG } from "@/lib/confidence-gate";
import { buildEvidenceSet } from "@/lib/evidence-set";
import type { AuditableRef } from "@/lib/relevance";
import { finalizeClaims } from "@/lib/claim-finalization";
import { validateDeliverableIntegrity } from "@/lib/deliverable-integrity";
import { lintManuscriptQuality, type ManuscriptSection } from "@/lib/manuscript-quality";
import { generateDeterministicGapAnalysis } from "@/lib/deterministic-gap.ts";
import { generateDeterministicScreen, validateScreenRequest } from "@/lib/deterministic-screen";
import { validateExploreRequest, scoreRecords, type ExploreRecord } from "@/lib/explore-scoring";
import {
  composeManuscript,
  validateEnrichedManuscript,
  validateComposeRequest,
  type ComposeStageInput
} from "@/lib/manuscript-composer";
import type { PicoWord } from "@/lib/pico-roles";
import { extractPicoFromQuestion } from "@/lib/pico-parser";
import { parseClinicalScenario } from "@/lib/clinical-semantics";
import { getSpecialtyDefinition } from "@/lib/specialties";
import { buildPubMedQuery } from "@/lib/pubmed-query";
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
      console.warn("[engine] cleanJsonResponse: JSON.parse failed on root; falling back to substring extraction between braces");
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Unable to parse JSON from LLM response");
  }
}

function validateScreenLlmResponse(
  data: unknown,
  words: PicoWord[]
): {
  established: { phrase: string; basis: string };
  conflicting: { phrase: string; basis: string };
  gap: { phrase: string; basis: string };
} | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const categories: Array<"established" | "conflicting" | "gap"> = ["established", "conflicting", "gap"];
  const out: Partial<Record<"established" | "conflicting" | "gap", { phrase: string; basis: string }>> = {};

  for (const cat of categories) {
    const item = obj[cat] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") return null;
    const phrase = typeof item.phrase === "string" ? item.phrase.trim() : "";
    const basis = typeof item.basis === "string" ? item.basis.trim() : "";

    if (!phrase || !basis) return null;
    if (basis.length > 400) return null;
    if (!phrase.includes("(P)") || !phrase.includes("(I)") || !phrase.includes("(C)") || !phrase.includes("(O)")) {
      return null;
    }
    out[cat] = { phrase, basis };
  }

  const established = out.established;
  const conflicting = out.conflicting;
  const gap = out.gap;
  if (!established || !conflicting || !gap) return null;

  if (
    established.phrase === conflicting.phrase ||
    established.phrase === gap.phrase ||
    conflicting.phrase === gap.phrase
  ) {
    return null;
  }

  const allText = `${established.phrase} ${conflicting.phrase} ${gap.phrase} ${established.basis} ${conflicting.basis} ${gap.basis}`.toLowerCase();
  for (const w of words) {
    if (!allText.includes(w.word.toLowerCase())) {
      return null;
    }
  }

  return { established, conflicting, gap };
}

async function callGemini(modelName: string, apiKey: string, system: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
    }
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240).replace(/\s+/g, " ");
    if (LLM_NON_RETRYABLE.has(res.status)) throw new LlmFatal(`Gemini ${res.status}: ${detail}`);
    const ra = Number(res.headers.get("retry-after"));
    const retryAfterMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 20_000) : 0;
    throw new LlmTransient(`Gemini ${res.status}: ${detail}`, retryAfterMs);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return cleanJsonResponse(text);
}

async function callOpenAiCompatible(url: string, apiKey: string, model: string, system: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240).replace(/\s+/g, " ");
    if (LLM_NON_RETRYABLE.has(res.status)) throw new LlmFatal(`LLM ${res.status}: ${detail}`);
    throw new LlmTransient(`LLM ${res.status}: ${detail}`, 0);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI provider");
  return cleanJsonResponse(text);
}

async function callLLM(system: string, payload: unknown, attempts = 2): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (GEMINI_API_KEY) {
        try {
          return await callGemini(MODEL, GEMINI_API_KEY, system, payload);
        } catch (geminiErr) {
          if (MODEL !== "gemini-1.5-flash") {
            try {
              return await callGemini("gemini-1.5-flash", GEMINI_API_KEY, system, payload);
            } catch {
              // fall through to throw geminiErr
            }
          }
          throw geminiErr;
        }
      } else if (GROQ_API_KEY) {
        const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
        return await callOpenAiCompatible("https://api.groq.com/openai/v1/chat/completions", GROQ_API_KEY, groqModel, system, payload);
      } else if (OPENROUTER_API_KEY) {
        const orModel = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";
        return await callOpenAiCompatible("https://openrouter.ai/api/v1/chat/completions", OPENROUTER_API_KEY, orModel, system, payload);
      } else if (OPENAI_API_KEY) {
        const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
        const oaModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
        return await callOpenAiCompatible(`${baseUrl}/chat/completions`, OPENAI_API_KEY, oaModel, system, payload);
      } else {
        throw new Error("No AI provider key configured");
      }
    } catch (e) {
      lastErr = e;
      if (e instanceof LlmFatal) break;
      if (attempt < attempts - 1) {
        const backoff = 1000 * Math.pow(2, attempt);
        const wait = e instanceof LlmTransient && e.retryAfterMs ? Math.max(backoff, e.retryAfterMs) : backoff;
        await new Promise(r => setTimeout(r, Math.min(wait, 5000)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM failed");
}

interface PubMedRef {
  pmid: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi?: string;
  url: string;
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

/** Records a reference as used so no later point, section or search can repeat it. */
function markUsedRef(r: PubMedRef, used: Set<string>): void {
  if (r.pmid) used.add(r.pmid);
  refKeys(r).forEach(k => used.add(k));
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
  lite = false
): Promise<PubMedRef[]>[] {
  return ALL_LITERATURE_SOURCES.map((src: LiteratureSource) => {
    // In gap mode PubMed is asked for twice as many records: neighbouring points run similar queries,
    // and earlier points use up the top hits that later points would otherwise get.
    if (src === "pubmed") return fetchPubMedReferences(query, lite ? maxResults * 2 : maxResults, excluded, questionType, interventionToken, lite).catch(() => []);
    return fetchFromSource(src, query, maxResults, questionType).then(arts => arts.map(libToRef)).catch(() => []);
  });
}

// Only http(s) links are ever emitted, so a crafted javascript:/data: URL from a
// tampered request body can never reach an href in the UI.
function safeUrl(u: unknown, fallback = ""): string {
  const s = typeof u === "string" ? u.trim() : "";
  return /^https?:\/\//i.test(s) ? s : fallback;
}

function dedupeRefs(refs: PubMedRef[]): PubMedRef[] {
  const seen = new Set<string>();
  const out: PubMedRef[] = [];
  for (const r of refs) {
    // A record without a title is not citable; never let one reach the pool.
    if (!(r.title || "").trim()) continue;
    const keys = refKeys(r);
    if (keys.length && keys.some(k => seen.has(k))) continue;
    keys.forEach(k => seen.add(k));
    out.push(r);
  }
  return out;
}

function curateModelRefs(
  c: Record<string, unknown>,
  evidenceSet: { retainedRecords: unknown[] },
  commentarySource: "ai" | "deterministic"
) {
  const fromModel = (Array.isArray(c.references) ? c.references : [])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const minCount = commentarySource === "deterministic" ? fromModel.length : 4;
  return curateReferences(fromModel, evidenceSet.retainedRecords as AuditableRef[], { min: minCount, max: 8 });
}

const NCBI_API_KEY = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY || "";

async function esearchIds(term: string, retmax: number, filters = ""): Promise<string[]> {
  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : "";
  await ncbiSlot();
  const res = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${retmax}&sort=relevance${filters}&term=${encodeURIComponent(term)}${apiKeyParam}`,
    { signal: AbortSignal.timeout(API_TIMEOUT_MS) }
  );
  if (res.status === 429) noteNcbiThrottle();
  if (!res.ok) throw new Error(`esearch ${res.status}`);
  const data = await res.json();
  return (data?.esearchresult?.idlist as string[]) || [];
}

async function esummaryForIds(ids: string[]): Promise<Record<string, ESummaryDoc>> {
  // An empty id list makes NCBI return an error payload, which would otherwise
  // throw and burn two pointless retry rounds.
  if (!ids.length) return {};
  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : "";
  await ncbiSlot();
  const res = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}${apiKeyParam}`,
    { signal: AbortSignal.timeout(API_TIMEOUT_MS) }
  );
  if (res.status === 429) noteNcbiThrottle();
  if (!res.ok) throw new Error(`esummary ${res.status}`);
  const data = await res.json();
  return (data?.result as Record<string, ESummaryDoc>) || {};
}

async function efetchAbstracts(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : "";
  try {
    await ncbiSlot();
    const res = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml${apiKeyParam}`,
      { signal: AbortSignal.timeout(API_TIMEOUT_MS) }
    );
    if (!res.ok) return map;
    const xml = await res.text();
    const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/gi;
    let match: RegExpExecArray | null;
    while ((match = articleRegex.exec(xml)) !== null) {
      const artXml = match[1];
      const pmidMatch = /<PMID[^>]*>(\d+)<\/PMID>/i.exec(artXml);
      if (!pmidMatch) continue;
      const pmid = pmidMatch[1];
      const abstractTexts: string[] = [];
      const absRegex = /<AbstractText(?:\s+Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/gi;
      let absMatch: RegExpExecArray | null;
      while ((absMatch = absRegex.exec(artXml)) !== null) {
        const label = absMatch[1];
        const text = decodeHtmlEntities(absMatch[2]);
        if (text) {
          abstractTexts.push(label ? `${label}: ${text}` : text);
        }
      }
      if (abstractTexts.length) {
        map.set(pmid, abstractTexts.join(" "));
      }
    }
  } catch {
    // Non-blocking degradation
  }
  return map;
}

async function fetchPubMedReferences(
  query: string,
  maxResults = 3,
  excluded: Set<string> = EMPTY_REF_SET,
  questionType?: string,
  interventionToken?: string,
  /** Gap-map mode: one relevance search per point instead of three, to stay inside NCBI's rate limit. */
  lite = false
): Promise<PubMedRef[]> {
  const isExcluded = questionType && ["diagnosis", "prognosis", "etiology", "screening"].some(t => questionType.toLowerCase().includes(t));
  const isTherapy = !isExcluded && (!questionType || /therapy|prevention/i.test(questionType));
  const rctFilter = (!query.includes("[pt]") && isTherapy)
    ? ' AND ("randomized controlled trial"[pt] OR "clinical trial"[pt] OR "controlled clinical trial"[pt])'
    : "";
  const term = `${query}${rctFilter} NOT "study protocol"[Publication Type] NOT "clinical trial protocol"[Publication Type]`;
  const extra = Math.min(excluded.size, 25);
  const want = Math.max(maxResults, 6);
  const t0 = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (isSourceCoolingDown("pubmed")) {
      const isOffline = process.env.AIMED_OFFLINE_LITERATURE === "1";
      recordSourceStatus("pubmed", {
        attempted: false,
        ok: false,
        skipped: isOffline ? "offline" : "cooldown",
        hits: 0,
        ms: 0
      });
      return [];
    }
    try {
      const reviewIds = lite ? [] : await esearchIds(term, want + extra, "&filter=pubt.review");
      const generalIds = await esearchIds(term, want + extra);

      let secondaryIds: string[] = [];
      const cleanInterv = interventionToken ? interventionToken.replace(/["()]/g, "").trim() : "";
      if (cleanInterv && isTherapy && !lite) {
        const meshTerm = buildPubMedQuery({ intervention: cleanInterv, questionType });
        const secondaryTerm = meshTerm
          ? `(${meshTerm}) NOT "study protocol"[Publication Type] NOT "clinical trial protocol"[Publication Type]`
          : `(${cleanInterv}[tiab]) AND ("randomized controlled trial"[pt]) NOT "study protocol"[Publication Type] NOT "clinical trial protocol"[Publication Type]`;
        try {
          secondaryIds = await esearchIds(secondaryTerm, Math.min(want, 20));
        } catch {
          secondaryIds = [];
        }
      }

      if (!reviewIds.length && !generalIds.length && !secondaryIds.length) {
        if (rctFilter) {
          const fallbackTerm = `${query} NOT "study protocol"[Publication Type] NOT "clinical trial protocol"[Publication Type]`;
          const fallbackIds = await esearchIds(fallbackTerm, want + extra);
          if (fallbackIds.length) {
            generalIds.push(...fallbackIds);
          }
        }
        if (!reviewIds.length && !generalIds.length && !secondaryIds.length) {
          recordSourceStatus("pubmed", {
            attempted: true,
            ok: true,
            skipped: "none",
            hits: 0,
            ms: Date.now() - t0
          });
          return [];
        }
      }

      const ids = Array.from(new Set([...generalIds, ...secondaryIds, ...reviewIds]))
        .filter(id => !excluded.has(id))
        .slice(0, maxResults);
      const result = await esummaryForIds(ids);
      const abstracts = lite ? new Map<string, string>() : await efetchAbstracts(ids);
      const refs = ids
        .map((id) => {
          const doc = result?.[id];
          const pubtypes = Array.isArray(doc?.pubtype) ? doc.pubtype : [];
          return {
            pmid: id,
            title: (doc?.title || "").trim(),
            // Vancouver lists up to six authors then "et al"; a seventh name tells the formatter
            // to add it. Collective (corporate) authors are kept as written.
            authors: (Array.isArray(doc?.authors) && doc.authors.length
              ? doc.authors.filter(a => a?.name && (!a.authtype || /author|collective/i.test(a.authtype))).slice(0, 7).map(a => String(a.name))
              : [doc?.sortfirstauthor || ""]).filter(Boolean).join(", "),
            year: doc?.pubdate?.slice(0, 4) || "",
            // NLM journal abbreviation ("N Engl J Med"), the form Vancouver references use.
            journal: doc?.source || doc?.fulljournalname || "",
            // elocationid can hold several IDs ("pii: fmaf049. doi: 10.1093/..."): take the DOI only.
            doi: (/\b10\.\d{4,9}\/[^\s"<>]+/.exec(doc?.elocationid || "")?.[0] || "").replace(/[.,;]+$/, ""),
            source: "pubmed",
            context: abstracts.get(id) || undefined,
            pubType: pubtypes.length ? pubtypes.join(", ") : undefined,
            publicationTypes: pubtypes.length ? pubtypes : undefined,
            url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
          };
        })
        // Some ESummary records carry no title at all; never emit a placeholder reference.
        // Protocols, errata and meeting abstracts are not evidence of an effect.
        .filter(r => r.title.length > 0 && !isNonEvidenceTitle(r.title));
      const deduped = dedupeRefs(refs);
      recordSourceStatus("pubmed", {
        attempted: true,
        ok: true,
        skipped: "none",
        hits: deduped.length,
        ms: Date.now() - t0
      });
      return deduped;
    } catch (err) {
      const is429 = /\b429\b/.test(err instanceof Error ? err.message : String(err));
      if (is429) {
        noteNcbiThrottle();
        noteSourceFailure("pubmed", err);
        recordSourceStatus("pubmed", {
          attempted: true,
          ok: false,
          skipped: "cooldown",
          hits: 0,
          ms: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err)
        });
        return [];
      }
      if (lite || attempt === 2) {
        noteSourceFailure("pubmed", err);
        recordSourceStatus("pubmed", {
          attempted: true,
          ok: false,
          skipped: "none",
          hits: 0,
          ms: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err)
        });
        return [];
      }
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  recordSourceStatus("pubmed", {
    attempted: true,
    ok: true,
    skipped: "none",
    hits: 0,
    ms: Date.now() - t0
  });
  return [];
}

async function fetchReferencesBroad(
  query: string,
  maxResults = 8,
  excluded: Set<string> = EMPTY_REF_SET,
  questionType?: string,
  interventionToken?: string
): Promise<PubMedRef[]> {
  // Every literature source is mandatory: all are queried on every call.
  const fetched = await Promise.allSettled(fetchAllSources(query, maxResults, excluded, questionType, interventionToken));
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
  // Multi-source bibliography representation: interleave sources round-robin without global
  // re-sort so PubMed cannot crowd out other sources. PubMed is capped at Math.ceil(want / 2)
  // whenever 2 or more sources return records.
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

const STOPWORDS = new Set(["and", "or", "not", "the", "a", "an", "of", "in", "on", "with", "for", "to", "is", "are", "as", "by", "at", "from"]);

const EMPTY_REF_SET = new Set<string>();

const TERM_FIXES: Array<[RegExp, string]> = [
  [/\blapururgical\b/gi, "laparoscopic"],
  [/\blaparosurgical\b/gi, "laparoscopic"],
  [/\blaparos??copic\b/gi, "laparoscopic"],
  [/\bhysteretomy\b/gi, "hysterectomy"],
  [/\bhysterecomy\b/gi, "hysterectomy"],
  [/\bhysterctmy\b/gi, "hysterectomy"],
  [/\bendometriotis\b/gi, "endometriosis"],
  [/\bendometriois\b/gi, "endometriosis"],
  [/\bgynacological\b/gi, "gynecological"],
  [/\bgynaecological\b/gi, "gynecological"],
  [/\bgyncological\b/gi, "gynecological"],
  [/\bendometreal\b/gi, "endometrial"],
  [/\bintra uterin\b/gi, "intrauterine"],
];

function fixTerms(s: string): string {
  return TERM_FIXES.reduce((acc, [re, fix]) => acc.replace(re, fix), s);
}

function sanitizeQuery(q: string, maxWords = 8): string {
  return q
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, maxWords)
    .join(" ");
}

function buildRefQuery(point: string, topic: string): string {
  const pw = sanitizeQuery(point).split(" ").slice(0, 5);
  const tw = sanitizeQuery(topic).split(" ").slice(0, 3);
  const words = pw.length >= 3 ? pw : [...pw, ...tw].slice(0, 6);
  return words.join(" ").slice(0, 120);
}

function cleanTopicQuery(topic: string): string {
  return sanitizeQuery(topic);
}

/**
 * How well a retrieved paper fits one evidence point of the gap map.
 *
 * The point text is boilerplate around the clinician's PICO words, so relevance is judged against
 * those words: the paper has to be about the typed population (and not a contradicting subtype)
 * and about the intervention or comparator. Matching the point's own search words breaks ties.
 * Returns -1 for a paper that must not be attached to the point at all.
 */
function pointRelevance(r: PubMedRef, elements: PicoElement[], pointQuery: string): number {
  const audit = auditRef(r, elements);
  const sel = selectedElements(elements);
  const needTreatment = sel.intervention || sel.comparator;
  if (sel.population && !audit.population) return -1;
  if (needTreatment && !audit.intervention && !audit.comparator) return -1;
  const hay = `${r.title} ${r.context || ""}`.toLowerCase();
  const qTokens = sanitizeQuery(pointQuery).toLowerCase().split(" ").filter(t => t.length > 3);
  const overlap = qTokens.filter(t => hay.includes(t)).length;
  let score = 4 + overlap;
  if (audit.intervention) score += 2;
  if (audit.comparator) score += 1;
  if (audit.outcome) score += 1;
  // MEDLINE-indexed records carry curated metadata and an abstract: prefer them on ties.
  if (/^\d+$/.test(r.pmid)) score += 2;
  if (r.context) score += 1;
  return score;
}

async function fetchReferencesForPoints(
  points: Array<{ point: string; searchQuery?: string }>,
  topic: string,
  excluded: Set<string>,
  elements: PicoElement[] = []
): Promise<Array<{ point: string; references: PubMedRef[] }>> {
  const queries = points.map(p => (p.searchQuery && p.searchQuery.length > 3 ? sanitizeQuery(p.searchQuery, 10) : buildRefQuery(p.point, topic)));

  // Bounded, fast retrieval: query across all mandatory literature databases for the clinical topic
  // and distinct point keywords without overwhelming external providers or triggering 429 bursts.
  const topicQuery = sanitizeQuery(topic, 10);
  const searchQueries = Array.from(new Set([
    topicQuery,
    ...queries
  ])).filter(q => q && q.length > 2).slice(0, 2);

  const candidatePool: PubMedRef[] = [];
  const fetchedBatches = await Promise.allSettled(
    searchQueries.map(q => Promise.allSettled(fetchAllSources(q, 6, EMPTY_REF_SET, undefined, undefined, true)))
  );

  for (const b of fetchedBatches) {
    if (b.status === "fulfilled") {
      for (const res of b.value) {
        if (res.status === "fulfilled") candidatePool.push(...res.value);
      }
    }
  }

  const pool = dedupeRefs(candidatePool);

  const results: Array<{ point: string; references: PubMedRef[] }> = [];
  for (let i = 0; i < points.length; i++) {
    const ranked = pool
      .filter(r => !isUsedRef(r, excluded))
      .map(r => ({ r, score: elements.length ? pointRelevance(r, elements, queries[i]) : 1 }))
      .filter(x => x.score >= 0)
      .sort((x, y) => y.score - x.score);

    // Best-first, but at most two papers from one database so every point shows several sources.
    const refs: PubMedRef[] = [];
    const local = new Set<string>();
    const perSource: Record<string, number> = {};
    for (const pass of [2, 4]) {
      for (const { r } of ranked) {
        if (refs.length >= 4) break;
        const src = r.source || "other";
        if ((perSource[src] || 0) >= pass || isUsedRef(r, local)) continue;
        refs.push(r);
        markUsedRef(r, local);
        perSource[src] = (perSource[src] || 0) + 1;
      }
    }

    for (const r of refs) markUsedRef(r, excluded);
    results.push({ point: points[i].point, references: refs });
  }

  // A point whose own search found nothing new borrows relevant, still-unused papers retrieved
  // for the other points (ranked for this point), so no evidence point is left empty while
  // relevant papers sit unused. Repetition is still impossible: `excluded` is checked first.
  for (let i = 0; i < results.length; i++) {
    if (results[i].references.length >= 2) continue;
    const extra = pool
      .filter(r => !isUsedRef(r, excluded))
      .map(r => ({ r, score: elements.length ? pointRelevance(r, elements, queries[i]) : 1 }))
      .filter(x => x.score >= 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3 - results[i].references.length);
    for (const { r } of extra) {
      results[i].references.push(r);
      markUsedRef(r, excluded);
    }
  }
  return results;
}

function kbContext() {
  return {
    specialties: KB,
    questionTypes: QUESTION_TYPES
  };
}

const isSpecialty = (s: unknown): s is keyof typeof KB =>
  typeof s === "string" && Object.prototype.hasOwnProperty.call(KB, s);

// Relevance, citation and audit logic now lives in @/lib/relevance (imported above) so the
// claim-specific filter is unit-testable and shared by the engine, the UI and exports.

/**
 * `input` carries clinician free text. Coercing it with String() turned a JSON number or object
 * into a plausible-looking clinical phrase - `{"stage":"intent","input":123}` returned
 * `intervention: "123"` with HTTP 200 - which then flowed into literature queries and the session
 * store as though a clinician had typed it. Reject the wrong type instead of inventing a term.
 */
function readFreeText(
  value: unknown,
  field: string,
  max = 2000
): { ok: true; text: string } | { ok: false; response: NextResponse } {
  if (value === undefined || value === null) return { ok: true, text: "" };
  if (typeof value !== "string") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Field "${field}" must be a string.` },
        { status: 400 }
      )
    };
  }
  return { ok: true, text: value.slice(0, max) };
}

/**
 * `clarify` and `formulate` both require the analysis object produced by `intent`. Without this
 * check a missing or malformed `analysis` fell through to the catch block and was reported as
 * "The AI service is temporarily unavailable" (503) � filing a client-side validation error as a
 * provider outage, which corrupts availability metrics and sends the user after the wrong fix.
 *
 * Also rejects an `analysis` that is structurally valid but clinically empty. Answering such a
 * request produces a confident, content-free clinical question, which is worse than an error.
 */
function readAnalysisStage(
  body: Record<string, unknown>,
  stage: string
): { ok: true; analysis: Analysis; answered: Record<string, string> } | { ok: false; response: NextResponse } {
  const bad = (error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status: 400 })
  });

  const raw = body.analysis;
  if (raw === undefined || raw === null) {
    return bad(`Stage "${stage}" requires an "analysis" object.`);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return bad(`Field "analysis" must be an object, received ${raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw}.`);
  }
  const a = raw as Partial<Analysis>;
  if (a.missing !== undefined && !Array.isArray(a.missing)) {
    return bad('Field "analysis.missing" must be an array of strings.');
  }
  const answeredRaw = body.answered;
  if (
    answeredRaw !== undefined && answeredRaw !== null &&
    (typeof answeredRaw !== "object" || Array.isArray(answeredRaw))
  ) {
    return bad('Field "answered" must be an object.');
  }

  const missing = Array.isArray(a.missing) ? a.missing.filter((f): f is string => typeof f === "string") : [];
  const hasContent = Boolean(
    a.specialty ||
    String(a.condition || "").trim() ||
    String(a.intervention || "").trim() ||
    String(a.comparator || "").trim() ||
    missing.length
  );
  if (!hasContent) {
    return bad(
      `Stage "${stage}" requires an analysis containing clinical content; run the "intent" stage first.`
    );
  }

  return {
    ok: true,
    analysis: { ...(a as Analysis), missing },
    answered: (answeredRaw || {}) as Record<string, string>
  };
}

/**
 * A formulation that cannot state a real clinical question is a 400, not a 200 with placeholders
 * (F-05). The response names the missing PICO elements and the question to ask for the first of
 * them, so the caller can resume clarification instead of presenting "Women with the population of
 * interest" to a clinician as though it were a formulated question.
 */
function formulated(f: ReturnType<typeof ruleFormulate>): NextResponse {
  if (f.complete) return NextResponse.json(f);
  const [first, ...rest] = f.missingElements;
  const question =
    first === "condition"
      ? "What is the clinical problem or population?"
      : first === "intervention"
        ? "What intervention are you considering?"
        : `What is the ${first}?`;
  return NextResponse.json(
    {
      error: `Cannot formulate a clinical question without ${f.missingElements.join(" and ")}.`,
      missing: f.missingElements,
      field: first ?? null,
      questionText: question,
      otherMissing: rest
    },
    { status: 400 }
  );
}

const analysisZodSchema = z.object({
  specialty: z.string().max(100).nullable().optional(),
  specialtyLabel: z.string().max(100).optional(),
  condition: z.string().max(1000).optional().nullable(),
  intervention: z.string().max(1000).optional().nullable(),
  comparator: z.string().max(1000).optional().nullable(),
  questionType: z.string().max(100).optional().nullable(),
  framework: z.string().max(100).optional().nullable(),
  missing: z.array(z.string().max(100)).optional().nullable(),
  interpretation: z.string().max(2000).optional().nullable(),
  source: z.string().max(50).optional().nullable(),
});

const intentGapSchema = z.object({
  stage: z.enum(["intent", "gap"]),
  input: z.string().max(2000).optional().nullable(),
  specialty: z.string().max(100).optional().nullable(),
  specialtyLabel: z.string().max(100).optional().nullable(),
  sources: z.array(z.string()).optional().nullable(),
});

const clarifyFormulateSchema = z.object({
  stage: z.enum(["clarify", "formulate"]),
  analysis: analysisZodSchema.optional().nullable(),
  answered: z.record(z.string(), z.string().max(1000)).optional().nullable(),
});

const commentaryZodSchema = z.object({
  stage: z.literal("commentary"),
  topic: z.string().max(2000).optional().nullable(),
  specialty: z.string().max(100).optional().nullable(),
  specialtyLabel: z.string().max(100).optional().nullable(),
  sources: z.array(z.string()).optional().nullable(),
  gapAnalysis: z.object({
    known: z.array(z.any()).optional().nullable(),
    uncertain: z.array(z.any()).optional().nullable(),
    specialty: z.string().max(100).optional().nullable(),
    specialtyLabel: z.string().max(100).optional().nullable(),
  }).optional().nullable(),
  selectedQuestion: z.string().max(1000).optional().nullable(),
  outcome: z.string().max(1000).optional().nullable(),
  outcomes: z.array(z.string().max(1000)).optional().nullable(),
  picoElements: z.array(z.object({
    label: z.string().max(200),
    value: z.string().max(2000),
  })).optional().nullable(),
  condition: z.string().max(1000).optional().nullable(),
  intervention: z.string().max(1000).optional().nullable(),
  comparator: z.string().max(1000).optional().nullable(),
  input: z.string().max(2000).optional().nullable(),
  questionType: z.string().max(200).optional().nullable(),
  age: z.string().max(50).optional().nullable(),
  sex: z.string().max(50).optional().nullable(),
});

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stageSchema = z.object({
    stage: z.enum(["intent", "clarify", "formulate", "gap", "commentary", "screen", "explore", "compose"]),
  });

  const baseResult = stageSchema.safeParse(body);
  if (!baseResult.success) {
    return NextResponse.json(
      { error: "Invalid stage parameter: " + baseResult.error.issues.map(e => e.message).join(", ") },
      { status: 400 }
    );
  }
  const stage = baseResult.data.stage;

  if (stage === "intent" || stage === "gap") {
    const res = intentGapSchema.safeParse(body);
    if (!res.success) {
      return NextResponse.json({ error: "Invalid parameters: " + res.error.issues.map(e => e.message).join(", ") }, { status: 400 });
    }
  } else if (stage === "clarify" || stage === "formulate") {
    const res = clarifyFormulateSchema.safeParse(body);
    if (!res.success) {
      return NextResponse.json({ error: "Invalid parameters: " + res.error.issues.map(e => e.message).join(", ") }, { status: 400 });
    }
  } else if (stage === "commentary") {
    const res = commentaryZodSchema.safeParse(body);
    if (!res.success) {
      return NextResponse.json({ error: "Invalid parameters: " + res.error.issues.map(e => e.message).join(", ") }, { status: 400 });
    }
  } else if (stage === "screen") {
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
      const specDef = getSpecialtyDefinition(specialty)!;

      // 1. Deterministic base computed first
      let screenPayload = generateDeterministicScreen(words);

      // 2. Retrieval: build queries conditioned with specialty context and retrieve through multi-source machinery
      let corpus: AuditableRef[] = [];
      let totalRetrieved = 0;
      try {
        const queryTerms = words.map(w => w.word.trim()).filter(Boolean);
        const query = queryTerms.join(" ");
        const primaryI = words.find(w => w.role === "intervention")?.word || "";
        const fetched = await fetchReferencesBroad(query, 25, EMPTY_REF_SET, "Therapy / Prevention", primaryI);
        corpus = fetched.slice(0, 30);
        totalRetrieved = fetched.length;
      } catch (fetchErr) {
        console.warn("[engine] screen literature retrieval failed:", fetchErr);
      }

      // Compute deterministic screen grounded in retrieved corpus if available
      if (corpus.length > 0) {
        screenPayload = generateDeterministicScreen(words, corpus, 0, totalRetrieved);
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
                  basis: validated.established.basis
                },
                conflicting: {
                  category: "conflicting",
                  phrase: validated.conflicting.phrase,
                  basis: validated.conflicting.basis
                },
                gap: {
                  category: "gap",
                  phrase: validated.gap.phrase,
                  basis: validated.gap.basis
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
      const { choice, words, specialty, excluded } = body as {
        choice: { category: "established" | "conflicting" | "gap"; phrase: string };
        words: PicoWord[];
        specialty: string;
        excluded?: { userExcluded?: string[]; seen?: string[] };
      };
      const specDef = getSpecialtyDefinition(specialty)!;
      const userExcluded = Array.isArray(excluded?.userExcluded) ? excluded!.userExcluded! : [];
      const seen = Array.isArray(excluded?.seen) ? excluded!.seen! : [];
      const blockedKeys = [...userExcluded, ...seen];

      let corpus: AuditableRef[] = [];
      let totalRetrieved = 0;
      let relaxationLevel: 0 | 1 | 2 = 0;

      const primaryI = words.find(w => w.role === "intervention")?.word || "";
      const queryTerms = words.map(w => w.word.trim()).filter(Boolean);
      const mainQuery = queryTerms.join(" ");

      try {
        const fetched = await fetchReferencesBroad(mainQuery, 30, EMPTY_REF_SET, "Therapy / Prevention", primaryI);
        corpus = fetched;
        totalRetrieved = fetched.length;
      } catch (fetchErr) {
        console.warn("[engine] explore primary literature retrieval failed:", fetchErr);
      }

      let scoredResult = scoreRecords(corpus, choice.phrase, choice.category, blockedKeys);
      let surviving = scoredResult.scored.filter(r => r.relevancePct >= 15);

      // Relaxation level 1: if fewer than 10 records survive, broaden with specialty conditions
      if (surviving.length < 10 && specDef.conditions.length > 0) {
        relaxationLevel = 1;
        try {
          const relaxTerms = [...queryTerms, specDef.conditions[0]];
          const relaxQuery = relaxTerms.join(" ");
          const relaxFetched = await fetchReferencesBroad(relaxQuery, 20, EMPTY_REF_SET, "Therapy / Prevention", primaryI);
          const merged = dedupeRefs([...(corpus as PubMedRef[]), ...relaxFetched]);
          corpus = merged;
          totalRetrieved = merged.length;
          scoredResult = scoreRecords(corpus, choice.phrase, choice.category, blockedKeys);
          surviving = scoredResult.scored.filter(r => r.relevancePct >= 15);
        } catch (relaxErr) {
          console.warn("[engine] explore relaxation level 1 failed:", relaxErr);
        }
      }

      // Relaxation level 2: if still fewer than 10, broaden with terminology or interventions
      if (surviving.length < 10 && (specDef.terminology.length > 0 || specDef.interventions.length > 0)) {
        relaxationLevel = 2;
        try {
          const extra = specDef.terminology[0] || specDef.interventions[0] || "";
          const relaxTerms = [primaryI || queryTerms[0], extra].filter(Boolean);
          const relaxQuery = relaxTerms.join(" ");
          const relaxFetched = await fetchReferencesBroad(relaxQuery, 20, EMPTY_REF_SET, "Therapy / Prevention", primaryI);
          const merged = dedupeRefs([...(corpus as PubMedRef[]), ...relaxFetched]);
          corpus = merged;
          totalRetrieved = merged.length;
          scoredResult = scoreRecords(corpus, choice.phrase, choice.category, blockedKeys);
          surviving = scoredResult.scored.filter(r => r.relevancePct >= 10);
        } catch (relaxErr) {
          console.warn("[engine] explore relaxation level 2 failed:", relaxErr);
        }
      }

      const returnedRecords = surviving.slice(0, 20);
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
        records,
        userExcluded,
        style
      } = body as ComposeStageInput;

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
        style: style || "vancouver"
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

    if (stage === "commentary") {
      resetSourceStatus();
      const commentaryStartTime = Date.now();
      const { topic, gapAnalysis, selectedQuestion, outcome, outcomes, picoElements } = body as {
        topic?: string; gapAnalysis?: { known?: unknown[]; uncertain?: unknown[] };
        selectedQuestion?: string; outcome?: string; outcomes?: Array<unknown>; picoElements?: Array<{ label?: unknown; value?: unknown }>;
      };
      const condParam = String((body as Record<string, unknown>).condition || "").trim();
      const intervParam = String((body as Record<string, unknown>).intervention || "").trim();
      const compParam = String((body as Record<string, unknown>).comparator || "").trim();
      const inputParam = String((body as Record<string, unknown>).input || "").trim();
      const qTypeParam = String((body as Record<string, unknown>).questionType || "").trim() || "Therapy / Prevention";

      // NOTE: there is deliberately no `if (!KEY) return 503` here. That guard made the
      // deterministic fallback below unreachable whenever no key was configured, which is the
      // situation of every desktop install (F-23) - so the evidence-critical stage failed outright
      // even though retrieval, claim filtering and citation integrity all work without a provider.
      // Absence of a key now selects the deterministic path further down, and the response reports
      // which path produced it.
      const outcomesArr = Array.isArray(outcomes)
        ? outcomes.filter((o): o is string => typeof o === "string").map(o => o.trim()).filter(Boolean)
        : [];
      const outcomesText = outcomesArr.length
        ? outcomesArr.join("; ")
        : (String(outcome || "").trim() || "the primary outcome for this question");
      // Literature sources are mandatory: any client-sent `sources` selection is ignored and
      // every database is searched (see fetchAllSources).

      const elements: PicoElement[] = Array.isArray(picoElements)
        ? picoElements
            .map(e => ({ label: String(e?.label || ""), value: String(e?.value || "") }))
            .filter(e => e.label && e.value)
        : [];

      // If elements is empty, populate from condition/intervention or parse from input/question/topic
      if (elements.length === 0) {
        if (condParam || intervParam) {
          if (condParam) elements.push({ label: "Population", value: condParam });
          if (intervParam) elements.push({ label: "Intervention", value: intervParam });
          if (compParam) elements.push({ label: "Comparator", value: compParam });
          const outVal = outcomesArr[0] || String(outcome || "").trim() || "clinical outcome";
          elements.push({ label: "Outcome", value: outVal });
        } else {
          const parsed = extractPicoFromQuestion(
            String(selectedQuestion || topic || inputParam || ""),
            String(topic || inputParam || ""),
            (gapAnalysis as { specialty?: SpecialtyKey } | undefined)?.specialty
          );
          if (parsed.condition) elements.push({ label: "Population", value: parsed.condition });
          if (parsed.intervention) elements.push({ label: "Intervention", value: parsed.intervention });
          if (parsed.comparator) elements.push({ label: "Comparator", value: parsed.comparator });
          const outVal = outcomesArr[0] || String(outcome || "").trim() || "clinical outcome";
          elements.push({ label: "Outcome", value: outVal });
        }
      }

      const interventionToken = intervParam || elements.find(e => /interv/i.test(e.label))?.value || "";

      const commentaryMaxResults = 50;
      const primaryTopic = cleanTopicQuery(String(topic || "")) || [intervParam, condParam].filter(Boolean).join(" ") || inputParam || String(selectedQuestion || "");
      let refPool = await fetchReferencesBroad(primaryTopic, commentaryMaxResults, EMPTY_REF_SET, qTypeParam, interventionToken);
      if (refPool.length < 6 && selectedQuestion) {
        const alt = await fetchReferencesBroad(sanitizeQuery(String(selectedQuestion)), commentaryMaxResults, EMPTY_REF_SET, qTypeParam, interventionToken);
        refPool.push(...alt);
      }
      const extra = Array.isArray(gapAnalysis?.known) ? gapAnalysis.known : [];
      const extra2 = Array.isArray(gapAnalysis?.uncertain) ? gapAnalysis.uncertain : [];
      // These references round-trip through the browser, so rebuild each one field by
      // field instead of trusting the payload: it blocks javascript:/data: URLs and
      // arbitrary extra keys from reaching the pool.
      for (const p of [...extra, ...extra2] as Array<{ references?: Array<Record<string, unknown>> }>) {
        for (const r of (p?.references || [])) {
          const pmid = String(r?.pmid || "").trim();
          const title = String(r?.title || "").trim();
          if (!pmid || !title) continue;
          if (refPool.some(x => x.pmid === pmid)) continue;
          refPool.push({
            pmid,
            title,
            authors: String(r?.authors || ""),
            year: String(r?.year || ""),
            journal: String(r?.journal || ""),
            doi: typeof r?.doi === "string" ? r.doi : undefined,
            url: safeUrl(r?.url, `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`),
            context: typeof r?.context === "string" ? r.context : undefined,
            source: typeof r?.source === "string" ? r.source : undefined
          });
        }
      }
      refPool = dedupeRefs(refPool);

      // ---- Claim-specific filtering boundary ----
      // Everything downstream (commentary generation, the rendered reference list, the audit
      // table, and every export) is derived from `directPool`. The model may only cite from
      // it, so an unrelated record can never reach the commentary or the reference list.
      let { kept: directPool, excluded: excludedByClaim } = filterByClaim(refPool, elements);

      // Targeted PICO & Outcome retrieval fallback if directPool has zero matches.
      // Often the broad topic search misses records that explicitly evaluate the target outcome.
      // Before declaring "No literature related to your search found", perform targeted searches
      // specifically for the target outcome combined with the intervention and population.
      if (directPool.length === 0 && elements.length > 0) {
        const byType = elements.reduce((acc, el) => {
          const l = el.label.toLowerCase();
          if (l.includes("pop")) acc.population = el.value;
          else if (l.includes("interv")) acc.intervention = el.value;
          else if (l.includes("comp")) acc.comparator = el.value;
          else if (l.includes("out")) acc.outcome = el.value;
          return acc;
        }, {} as Record<string, string>);

        const targetPop = byType.population || "";
        const targetInt = byType.intervention || "";
        const targetOut = byType.outcome || outcome || outcomesArr[0] || "";

        const queriesToTry = [
          // 1. Intervention + Outcome + core Population
          sanitizeQuery(`${targetInt} ${targetOut} ${targetPop}`),
          // 2. Focused Treatment + Outcome
          sanitizeQuery(`${targetInt} ${targetOut}`),
          // 3. Selected Question directly
          selectedQuestion ? sanitizeQuery(String(selectedQuestion)) : ""
        ].filter(
          (q, idx, arr) => q && q.length > 3 && arr.indexOf(q) === idx && q !== cleanTopicQuery(String(topic || ""))
        );

        for (const query of queriesToTry) {
          const additionalRefs = await fetchReferencesBroad(query, commentaryMaxResults, EMPTY_REF_SET, qTypeParam, interventionToken);
          if (additionalRefs.length) {
            refPool = dedupeRefs([...refPool, ...additionalRefs]);
            const filtered = filterByClaim(refPool, elements);
            directPool = filtered.kept;
            excludedByClaim = filtered.excluded;
            if (directPool.length > 0) break;
          }
        }
      }

      // Build canonical evidence set from retained records to serve as the single source of truth
      // for allowed citations, deduplication and revalidation.
      const evidenceSet = await buildEvidenceSet(directPool as AuditableRef[]);
      // Records that match the population and outcome but not the selected treatment are
      // genuine background. They are kept out of the reference list and shown separately so
      // the user can see what was retrieved but not treated as direct evidence.
      const contextualPool = excludedByClaim
        .filter(e => e.audit.population && e.audit.outcome)
        .map(e => e.ref);
      const poolForPrompt = evidenceSet.retainedRecords.slice(0, 18).map(r => ({
        authors: r.authors, year: r.year, title: r.title, journal: r.journal,
        doi: r.doi, url: r.url, abstract: (r.context || "").slice(0, 500)
      }));
      // No record survived the claim filter: there is nothing to comment on. Calling the model
      // here would only invite it to assert findings it has no source for, so the request is
      // answered with the explicit no-evidence state instead of a commentary.
      if (directPool.length === 0) {
        return NextResponse.json({
          title: "No literature related to your search found",
          abstract: "",
          keywords: [],
          introduction: "",
          discussion: "",
          conclusion: "",
          references: [],
          fetchedReferences: [],
          additionalEvidence: [],
          contextualReferences: contextualPool,
          retainedCount: 0,
          retrievedCount: refPool.length,
          excludedCount: excludedByClaim.length,
          excludedReferences: excludedByClaim.slice(0, 20).map(e => ({
            pmid: e.ref.pmid, title: e.ref.title, reason: e.reason,
            url: safeUrl(e.ref.url, `https://pubmed.ncbi.nlm.nih.gov/${e.ref.pmid}/`)
          })),
          droppedReferences: [],
          noDirectEvidence: true,
          salvageAvailable: excludedByClaim.length > 0,
          sourceStatus: sourceStatusSnapshot(),
          refAudit: [],
          paperRefAudit: [],
          citationChecks: { totalRefs: 0, citedRefs: 0, uncited: [], orphans: [], consistent: true },
          telemetry: {
            pathUsed: "deterministic",
            fallbackTriggered: false,
            failedGates: 0,
            processingTimeMs: Math.max(1, Date.now() - commentaryStartTime),
            llmAvailable: !!KEY
          }
        });
      }
      // The model is asked for a self-consistent draft: every listed reference cited, every
      // citation resolvable. When it is not, one corrective retry names the offending
      // citations rather than shipping a commentary whose reference list it does not support.
      const passedCommentarySpec = (body as { specialty?: string })?.specialty || (gapAnalysis as { specialty?: string })?.specialty;
      const activeSpecKey = isSpecialty(passedCommentarySpec) ? passedCommentarySpec : null;
      const activeSpecDef = activeSpecKey ? getSpecialtyDefinition(activeSpecKey) : null;
      const promptRole = activeSpecDef?.systemPromptRole || "You are an expert physician, clinical investigator, and academic medical writer across evidence-based clinical medicine.";
      const methodsGuidance = buildTruthfulMethodsText(outcomesText);

      const basePrompt = `${promptRole}

Generate a comprehensive, publication-grade scientific commentary paper strictly grounded in the given research question, selected outcomes, and provided reference pool. The paper must read like a rich, thoughtful clinical synthesis written by an experienced academic physician/researcher, not like a superficial AI summary.

RESEARCH QUESTION: ${String(selectedQuestion || topic || "")}

SELECTED OUTCOMES: ${outcomesText}

CRITICAL RULES:
1. Title: Create a precise, academic, clinically meaningful title. Format: "[Intervention] versus [Comparator] for [Outcome] in [Population]: A Critical Clinical Commentary and Evidence Appraisal".
2. Structured Abstract (250–350 words): Must include bold labeled sections:
   - **Background:** High-level epidemiological context, disease burden, and clinical dilemma.
   - **Objective:** Explicit formulation of the clinical PICO question and comparative objective.
   - **Methods:** Truthfully describe search scope (${methodsGuidance}). Multi-database retrieval filtered against PICO claim criteria; specify number of verified records retained.
   - **Results:** Grounded synthesis citing records with Vancouver brackets [1], [2], etc., detailing trial methodologies, reported clinical parameters, and direction of response without fabricating numbers.
   - **Conclusions:** Decisive, balanced clinical bottom line and GRADE evidence certainty.
3. Introduction (≥250 words, 2–3 rich paragraphs):
   - Paragraph 1: Disease burden, epidemiology, and pathophysiological substrate of the clinical condition. Explain biological mechanisms at play and clinical dilemmas regarding ${outcomesText}.
   - Paragraph 2: Biological plausibility and pharmacological/procedural mechanisms of action of the intervention versus comparator. Contrast mechanisms across patient subgroups.
   - Paragraph 3: Clinical dilemma, reason for lingering equipoise across published trials, and precise appraisal objective.
4. Methods (≥400 words):
   - Paragraph 1: Search strategy across biomedical repositories (PubMed, Europe PMC, Google Scholar, Semantic Scholar, Cochrane, etc.).
   - Paragraph 2: Query formulation and Boolean logic for population, intervention, comparator, and outcome.
   - Paragraph 3: Multi-stage screening, eligibility criteria, and deduplication process.
   - Paragraph 4: Study design classification and extraction of reported directions of effect.
5. Results (≥400 words):
   - Paragraph 1: Literature search yield, retained records count, and publication date range.
   - Paragraph 2: Methodological architecture (RCTs, observational cohorts, systematic reviews).
   - Paragraph 3: Direction-of-effect synthesis across primary and secondary outcomes, citing retained records [1], [2], etc.
   - Paragraph 4: Study-by-study outcome reporting and adherence to published abstract parameters without statistical extrapolation.
6. Discussion (≥400 words — organized with concise Markdown subheadings):
   - #### Evidence Base Scope: Overview of retained records, study designs, and publication span.
   - #### Study-by-Study Critical Appraisal: Analyze each retained record study-by-study with its in-text bracket citation [1], [2], etc.
   - #### Comparative Synthesis & Clinical Concordance: Compare findings across studies; explain concordance, discordance, and clinical/methodological factors explaining variations.
   - #### Methodological Quality, Risk of Bias & Evidence Certainty: Critical appraisal under GRADE principles.
   - #### Clinical Interpretation & Practice Translation: Real clinical implications and patient phenotypes.
   - #### Research Gaps: Key unanswered questions for future trials.
   - #### Limitations of this Evidence Appraisal: Transparently state abstract-level constraints, absence of formal RoB scoring, and single-query boundaries.
7. Conclusion (100–200 words, 2 balanced paragraphs):
   - Paragraph 1: Decisive, evidence-grounded summary answering the PICO question.
   - Paragraph 2: Practice considerations for individualized risk counseling and future trial priorities.
8. References & In-Text Citations:
   - In-text citations MUST use Vancouver numbered square brackets matching the reference list sequentially: [1], [2], [1-3].
   - References array: Strings in pure Vancouver style (ICMJE/NLM) built ONLY from the provided referencePool in exact sequential order of citation: "1. Author(s). Title. Journal. Year;Volume(Issue):Pages. doi:... URL".
   - Zero hallucination: cite and list references ONLY from referencePool. Never invent studies, statistics, sample sizes, or p-values not in the records.
9. Scientific Honesty & Quality Rules:
   - No Duplicated Boilerplate: Every section must contain unique narrative; do not duplicate sentences or phrases >8 words across sections.
   - Word Floors: Strictly respect word minimums (Abstract 250-350w, Intro ≥250w, Methods ≥400w, Results ≥400w, Discussion ≥400w, Conclusion 100-200w).
   - Honesty Scan: Do not report numerical statistics (percentages, risk ratios, odds ratios, hazard ratios) unless explicitly quoted from the reference pool.
   - Mandatory Citation on Assertions: Every assertive sentence discussing clinical findings, mechanisms, or outcomes MUST carry an in-text bracket citation (e.g. [1]).
   - Hedging Calibration: Calibrate conclusions to evidence depth (use cautious hedging when records are sparse; avoid "definitive", "proves", or "settles").`;
      const promptPayload = {
        topic, gapAnalysis, selectedQuestion, outcome: outcomesText, referencePool: poolForPrompt
      };
      const responseShape = `Respond ONLY with JSON: {title, abstract, keywords, introduction, methods, results, discussion, conclusion, references}.`;

      // The model is asked for a self-consistent draft: every listed reference cited, every
      // citation resolvable. When it is not, a bounded corrective retry names the offending
      // citations rather than shipping a commentary whose reference list it does not support.
      // The loop stops at the first self-consistent draft, so a good first pass costs one call.
let commentary: Record<string, unknown>;
      // Provenance is reported to the client. A deterministic evidence list and a model-written
      // synthesis are very different things to hand a clinician, and the response previously gave
      // no way to tell them apart (`source` came back undefined for both).
      let commentarySource: "ai" | "deterministic";
      let activeTelemetry: {
        pathUsed: "llm" | "deterministic";
        fallbackTriggered: boolean;
        failedGates: number;
        processingTimeMs: number;
        llmAvailable: boolean;
        fallbackReason?: string;
      } | null = null;
      let confidenceSummary: string | undefined = undefined;

      if (!KEY) {
        commentarySource = "deterministic";
        commentary = generateDeterministicCommentary({
          selectedQuestion: String(selectedQuestion || topic || ""),
          outcomesText,
          reason: "no AI provider key is configured for this instance",
          pool: evidenceSet.retainedRecords as AuditableRef[],
          elements
        });
      } else {
        try {
          commentary = await callLLM(`${basePrompt}\n${responseShape}`, promptPayload, 2);
          commentarySource = "ai";
        } catch (e) {
          console.error("[engine] LLM commentary generation failed, using deterministic fallback:", e);
          commentarySource = "deterministic";
          commentary = generateDeterministicCommentary({
            selectedQuestion: String(selectedQuestion || topic || ""),
            outcomesText,
            reason: "the AI writing service did not respond",
            pool: evidenceSet.retainedRecords as AuditableRef[],
            elements
          });
        }
      }
      
      // Evaluate LLM output through confidence gate when AI path was attempted
      // If confidence gates fail, gracefully fall back to deterministic output
      if (commentarySource === "ai") {
        const initialCurated = curateModelRefs(commentary, evidenceSet, commentarySource);
        const draftCitationIndexMap = new Map<number, AuditableRef>();
        initialCurated.references.forEach((refStr, idx) => {
          const resolved = initialCurated.resolved.get(refStr);
          if (resolved) draftCitationIndexMap.set(idx + 1, resolved);
        });
        const preliminaryFinalized = finalizeClaims({
          fields: {
            abstract: String(commentary.abstract || ""),
            introduction: String(commentary.introduction || ""),
            discussion: String(commentary.discussion || ""),
            conclusion: String(commentary.conclusion || "")
          },
          evidenceSet,
          elements,
          citationIndexMap: draftCitationIndexMap
        });

        const confidenceResult = evaluateConfidence(
          commentary,
          evidenceSet,
          elements,
          { ...DEFAULT_CONFIDENCE_CONFIG, llmAvailable: !!KEY },
          commentaryStartTime,
          {
            claimWarnings: preliminaryFinalized.warnings,
            totalClaims: preliminaryFinalized.claims.length,
            unsupportedClaims: preliminaryFinalized.warnings.length
          }
        );
        confidenceSummary = confidenceResult.fallbackReason;
        
        // Telemetry logging for LLM vs deterministic path tracking
        const telemetry = createTelemetryEvent(confidenceResult.telemetry, {
          stage: "commentary",
          question: selectedQuestion,
          outcomes: outcomesText,
          fallbackTriggered: false,
          processingTimeMs: Date.now() - commentaryStartTime
        });
        console.info("[engine] [telemetry]", JSON.stringify(telemetry));
        activeTelemetry = {
          pathUsed: confidenceResult.telemetry.pathUsed,
          fallbackTriggered: confidenceResult.telemetry.fallbackTriggered,
          failedGates: confidenceResult.telemetry.failedGates,
          processingTimeMs: Math.max(1, Date.now() - commentaryStartTime),
          llmAvailable: !!KEY
        };
        
        // If confidence gates fail, gracefully fall back to deterministic output
        if (shouldUseDeterministicFallback(confidenceResult)) {
          console.warn("[engine] Confidence gates failed, falling back to deterministic:", confidenceResult.fallbackReason);
          commentarySource = "deterministic";
          commentary = generateDeterministicCommentary({
            selectedQuestion: String(selectedQuestion || topic || ""),
            outcomesText,
            reason: confidenceResult.fallbackReason || "AI output failed confidence validation",
            pool: evidenceSet.retainedRecords as AuditableRef[],
            elements
          });
          
          // Log fallback telemetry
          const fallbackTelemetry = createTelemetryEvent({
            pathUsed: "deterministic",
            fallbackTriggered: true,
            failedGates: confidenceResult.gates.filter(g => !g.passed).length,
            llmAvailable: true
          }, {
            stage: "commentary",
            question: selectedQuestion,
            fallbackReason: confidenceResult.fallbackReason,
            processingTimeMs: Date.now() - commentaryStartTime
          });
          console.info("[engine] [telemetry] [fallback]", JSON.stringify(fallbackTelemetry));
          activeTelemetry = {
            pathUsed: "deterministic",
            fallbackTriggered: true,
            failedGates: confidenceResult.gates.filter(g => !g.passed).length,
            processingTimeMs: Math.max(1, Date.now() - commentaryStartTime),
            llmAvailable: true,
            fallbackReason: confidenceResult.fallbackReason
          };
        }
      } else {
        // Deterministic path telemetry
        const fallbackReason = !KEY ? "no_key" : "llm_failure";
        const telemetry = createTelemetryEvent({
          pathUsed: "deterministic",
          fallbackTriggered: !KEY ? false : true,
          failedGates: 0,
          llmAvailable: !!KEY
        }, {
          stage: "commentary",
          question: selectedQuestion,
          outcomes: outcomesText,
          fallbackReason,
          processingTimeMs: Date.now() - commentaryStartTime
        });
        console.info("[engine] [telemetry]", JSON.stringify(telemetry));
        activeTelemetry = {
          pathUsed: "deterministic",
          fallbackTriggered: !KEY ? false : true,
          failedGates: 0,
          processingTimeMs: Math.max(1, Date.now() - commentaryStartTime),
          llmAvailable: !!KEY,
          fallbackReason
        };
      }
      let curated = curateModelRefs(commentary, evidenceSet, commentarySource);
      let citationChecks = checkCitations(String(commentary.discussion || ""), curated.references);
      let repairs = 0;
      // Only a model-produced draft can be repaired by asking the model again. A deterministic
      // draft is already built to cite every record it lists, so retrying would just burn two
      // provider calls that cannot succeed.
      while (commentarySource === "ai" && (citationChecks.orphans.length || citationChecks.uncited.length) && repairs < 2) {
        repairs++;
          try {
            commentary = await callLLM(
              `${basePrompt}
- Your previous draft was rejected for citation integrity. These in-text citations name no reference you listed: ${citationChecks.orphans.join("; ") || "none"}. These references you listed were never cited in the text: ${citationChecks.uncited.map(u => u.split(".")[0]).join("; ") || "none"}. Fix both: cite each listed reference at least once using sequential Vancouver numeric brackets [1], [2], etc., and delete or correct every citation that is not in the referencePool.
${responseShape}`,
              promptPayload,
              2
            );
          } catch (e) {
            console.error("[engine] LLM commentary repair failed, using current commentary:", e);
          }
        curated = curateModelRefs(commentary, evidenceSet, commentarySource);
        citationChecks = checkCitations(String(commentary.discussion || ""), curated.references);
      }

      // Claim-level finalization runs on every narrative field, before references are curated. A
      // citation proves a paper exists, not that it supports the sentence citing it, so each
      // assertive sentence is judged against the retained sources it points at. An assertive
      // sentence with no surviving support is replaced by an explicit statement of uncertainty
      // rather than left standing as a finding with its attribution removed.
      const citationIndexMap = new Map<number, AuditableRef>();
      curated.references.forEach((refStr, idx) => {
        const resolved = curated.resolved.get(refStr);
        if (resolved) citationIndexMap.set(idx + 1, resolved);
      });

      const finalized = finalizeClaims({
        fields: {
          abstract: String(commentary.abstract || ""),
          introduction: String(commentary.introduction || ""),
          methods: String(commentary.methods || ""),
          results: String(commentary.results || ""),
          discussion: String(commentary.discussion || ""),
          conclusion: String(commentary.conclusion || "")
        },
        evidenceSet,
        elements,
        citationIndexMap
      });
      commentary.abstract = finalized.fields.abstract;
      commentary.introduction = finalized.fields.introduction;
      if (finalized.fields.methods) commentary.methods = finalized.fields.methods;
      if (finalized.fields.results) commentary.results = finalized.fields.results;
      commentary.discussion = finalized.fields.discussion;
      commentary.conclusion = finalized.fields.conclusion;
      const claimWarnings = finalized.warnings;

      const narrativeOf = () =>
        [commentary.abstract, commentary.introduction, commentary.methods, commentary.results, commentary.discussion, commentary.conclusion]
          .map(v => String(v || ""))
          .join(" ");

      // A reference the text never cites is not part of this commentary's evidence base. Drop
      // them so the published list is exactly what the prose supports, rather than a list the
      // user is then told is partly uncited.
      // Trimming, orphan removal and canonical revalidation are one deterministic fixpoint across
      // the whole narrative, because each of them can undo the others: dropping a reference strands
      // its citation, removing that citation strands the reference, and neither half-consistent
      // state is one this app is willing to publish.
      const reconciled = reconcileNarrative(
        {
          abstract: String(commentary.abstract || ""),
          introduction: String(commentary.introduction || ""),
          methods: String(commentary.methods || ""),
          results: String(commentary.results || ""),
          discussion: String(commentary.discussion || ""),
          conclusion: String(commentary.conclusion || "")
        },
        curated.references,
        evidenceSet.allowedCitationKeys,
        evidenceSet.citationMap
      );
      const evidenceWarnings: string[] = [];
      commentary.abstract = reconciled.fields.abstract;
      commentary.introduction = reconciled.fields.introduction;
      if (reconciled.fields.methods) commentary.methods = reconciled.fields.methods;
      if (reconciled.fields.results) commentary.results = reconciled.fields.results;
      commentary.discussion = reconciled.fields.discussion;
      commentary.conclusion = reconciled.fields.conclusion;
      const finalRefs = [...reconciled.references];
      const removedCitations = reconciled.removedCitations;
      const droppedRefs = curated.dropped;
      commentary.references = finalRefs;
      citationChecks = checkCitations(narrativeOf(), finalRefs);
      const resolvedDirect = new Map(finalRefs.map((r, i) => [r, curated.records[i]]));
      // The source list is the record behind each surviving reference, re-resolved after
      // reconciliation so `fetchedReferences` can never drift from `references`.
      const curatedRecords: AuditableRef[] = [];
      for (const raw of finalRefs) {
        const rec = curated.resolved.get(raw)
          ?? resolveReference(raw, evidenceSet.retainedRecords as AuditableRef[]);
        if (rec) curatedRecords.push(rec);
      }

      // Retained records that are not in the bibliography. Shown as additional evidence so the
      // user can see the full evidence base, never mixed into the reference list.
      const citedKeys = new Set(curatedRecords.map(r => r.doi ? `doi:${r.doi.toLowerCase()}` : (r.title || "").slice(0, 60).toLowerCase()));
      const additionalEvidence = directPool.filter(r =>
        !citedKeys.has(r.doi ? `doi:${r.doi.toLowerCase()}` : (r.title || "").slice(0, 60).toLowerCase())
      );
      // Audits describe only records that survived the claim filter and are actually cited,
      // so the UI can never present an audit row for a reference that is not in the list.
      const paperRefAudit = finalRefs
        .map((raw: string) => {
          const rec = curated.resolved.get(raw) ?? resolvedDirect.get(raw) ?? resolveReference(raw, evidenceSet.retainedRecords as AuditableRef[]);
          if (!rec) return null;
          return { ref: raw, audit: auditRef(rec, elements) };
        })
        .filter((x: { ref: string; audit: RefAudit } | null): x is { ref: string; audit: RefAudit } => !!x);
      // `fetchedReferences` is exactly the records behind `commentary.references`: the rendered
      // list, the audit table and both PDF exports are therefore the same set, built from
      // authoritative source metadata. The filtering itself is auditable from the counts.
const noDirectEvidence = directPool.length === 0;
      // Last gate before publication. The reconciliation above already drives the narrative and
      // the list into agreement, and this asserts that on the exact payload being returned, so a
      // future edit cannot ship an orphan citation, an uncited reference, or a reference that
      // resolves to nothing in the retained set without this failing loudly.
      let integrity = validateDeliverableIntegrity({
        fields: {
          abstract: String(commentary.abstract || ""),
          introduction: String(commentary.introduction || ""),
          methods: String(commentary.methods || ""),
          results: String(commentary.results || ""),
          discussion: String(commentary.discussion || ""),
          conclusion: String(commentary.conclusion || "")
        },
        references: finalRefs,
        retainedRecords: curatedRecords,
        allowedKeys: evidenceSet.allowedCitationKeys,
        citationMap: evidenceSet.citationMap
      });
      if (!integrity.ok && commentarySource === "ai") {
        console.warn("[engine] AI commentary failed deliverable integrity. Falling back to deterministic synthesis.");
        commentarySource = "deterministic";
        activeTelemetry = {
          pathUsed: "deterministic",
          fallbackTriggered: true,
          failedGates: 1,
          processingTimeMs: Math.max(1, Date.now() - commentaryStartTime),
          llmAvailable: !!KEY,
          fallbackReason: "Citation integrity reconciliation"
        };
        commentary = generateDeterministicCommentary({
          selectedQuestion: String(selectedQuestion || topic || ""),
          outcomesText,
          reason: "Citation integrity reconciliation",
          pool: evidenceSet.retainedRecords as AuditableRef[],
          elements
        });
        curated = curateModelRefs(commentary, evidenceSet, commentarySource);
        const fallbackReconciled = reconcileNarrative(
          {
            abstract: String(commentary.abstract || ""),
            introduction: String(commentary.introduction || ""),
            methods: String(commentary.methods || ""),
            results: String(commentary.results || ""),
            discussion: String(commentary.discussion || ""),
            conclusion: String(commentary.conclusion || "")
          },
          curated.references,
          evidenceSet.allowedCitationKeys,
          evidenceSet.citationMap
        );
        commentary.abstract = fallbackReconciled.fields.abstract;
        commentary.introduction = fallbackReconciled.fields.introduction;
        if (fallbackReconciled.fields.methods) commentary.methods = fallbackReconciled.fields.methods;
        if (fallbackReconciled.fields.results) commentary.results = fallbackReconciled.fields.results;
        commentary.discussion = fallbackReconciled.fields.discussion;
        commentary.conclusion = fallbackReconciled.fields.conclusion;
        const fallbackFinalRefs = [...fallbackReconciled.references];
        commentary.references = fallbackFinalRefs;
        const fallbackCuratedRecords: AuditableRef[] = [];
        for (const raw of fallbackFinalRefs) {
          const rec = curated.resolved.get(raw) ?? resolveReference(raw, evidenceSet.retainedRecords as AuditableRef[]);
          if (rec) fallbackCuratedRecords.push(rec);
        }
        curatedRecords.length = 0;
        curatedRecords.push(...fallbackCuratedRecords);
        finalRefs.length = 0;
        finalRefs.push(...fallbackFinalRefs);
        integrity = validateDeliverableIntegrity({
          fields: {
            abstract: String(commentary.abstract || ""),
            introduction: String(commentary.introduction || ""),
            methods: String(commentary.methods || ""),
            results: String(commentary.results || ""),
            discussion: String(commentary.discussion || ""),
            conclusion: String(commentary.conclusion || "")
          },
          references: finalRefs,
          retainedRecords: curatedRecords,
          allowedKeys: evidenceSet.allowedCitationKeys,
          citationMap: evidenceSet.citationMap
        });
      }
      if (!integrity.ok) {
        return NextResponse.json({
          error: "Commentary failed citation integrity validation and was not published.",
          integrity,
          sourceStatus: sourceStatusSnapshot(),
          telemetry: activeTelemetry ? {
            ...activeTelemetry,
            processingTimeMs: Math.max(1, Date.now() - commentaryStartTime)
          } : undefined
        }, { status: 500 });
      }

      // Sync sections blocks if commentary was modified
      if (commentary.sections && Array.isArray(commentary.sections)) {
        for (const sec of commentary.sections as Array<{ heading?: string; blocks?: string[] }>) {
          if (sec.heading === "Abstract" && commentary.abstract) sec.blocks = [String(commentary.abstract)];
          if (sec.heading === "Introduction" && commentary.introduction) sec.blocks = [String(commentary.introduction)];
          if (sec.heading === "Conclusion" && commentary.conclusion) sec.blocks = [String(commentary.conclusion)];
        }
      }

      // Quality linter gate
      let quality = lintManuscriptQuality({
        title: String(commentary.title || ""),
        abstract: String(commentary.abstract || ""),
        introduction: String(commentary.introduction || ""),
        methods: String(commentary.methods || ""),
        results: String(commentary.results || ""),
        discussion: String(commentary.discussion || ""),
        conclusion: String(commentary.conclusion || ""),
        sections: (commentary.sections as unknown as ManuscriptSection[]) || undefined,
        references: finalRefs,
        retainedRecords: curatedRecords,
        elements,
        isSparse: noDirectEvidence
      });

      if (!quality.passed && commentarySource === "ai") {
        console.warn("[engine] AI commentary failed manuscript quality check. Falling back to deterministic synthesis.", quality.rules.filter(r => !r.passed));
        commentarySource = "deterministic";
        activeTelemetry = {
          pathUsed: "deterministic",
          fallbackTriggered: true,
          failedGates: 1,
          processingTimeMs: Math.max(1, Date.now() - commentaryStartTime),
          llmAvailable: !!KEY,
          fallbackReason: "Manuscript quality linter failure"
        };
        commentary = generateDeterministicCommentary({
          selectedQuestion: String(selectedQuestion || topic || ""),
          outcomesText,
          reason: "Manuscript quality linter failure",
          pool: evidenceSet.retainedRecords as AuditableRef[],
          elements
        });
        curated = curateModelRefs(commentary, evidenceSet, commentarySource);
        const fallbackReconciled = reconcileNarrative(
          {
            abstract: String(commentary.abstract || ""),
            introduction: String(commentary.introduction || ""),
            methods: String(commentary.methods || ""),
            results: String(commentary.results || ""),
            discussion: String(commentary.discussion || ""),
            conclusion: String(commentary.conclusion || "")
          },
          curated.references,
          evidenceSet.allowedCitationKeys,
          evidenceSet.citationMap
        );
        commentary.abstract = fallbackReconciled.fields.abstract;
        commentary.introduction = fallbackReconciled.fields.introduction;
        if (fallbackReconciled.fields.methods) commentary.methods = fallbackReconciled.fields.methods;
        if (fallbackReconciled.fields.results) commentary.results = fallbackReconciled.fields.results;
        commentary.discussion = fallbackReconciled.fields.discussion;
        commentary.conclusion = fallbackReconciled.fields.conclusion;
        const fallbackFinalRefs = [...fallbackReconciled.references];
        commentary.references = fallbackFinalRefs;
        const fallbackCuratedRecords: AuditableRef[] = [];
        for (const raw of fallbackFinalRefs) {
          const rec = curated.resolved.get(raw) ?? resolveReference(raw, evidenceSet.retainedRecords as AuditableRef[]);
          if (rec) fallbackCuratedRecords.push(rec);
        }
        curatedRecords.length = 0;
        curatedRecords.push(...fallbackCuratedRecords);
        finalRefs.length = 0;
        finalRefs.push(...fallbackFinalRefs);

        quality = lintManuscriptQuality({
          title: String(commentary.title || ""),
          abstract: String(commentary.abstract || ""),
          introduction: String(commentary.introduction || ""),
          methods: String(commentary.methods || ""),
          results: String(commentary.results || ""),
          discussion: String(commentary.discussion || ""),
          conclusion: String(commentary.conclusion || ""),
          sections: (commentary.sections as unknown as ManuscriptSection[]) || undefined,
          references: finalRefs,
          retainedRecords: curatedRecords,
          elements,
          isSparse: noDirectEvidence
        });
      }

      if (!quality.passed) {
        return NextResponse.json({
          error: "Commentary failed manuscript quality validation and was not published.",
          quality,
          sourceStatus: sourceStatusSnapshot(),
          telemetry: activeTelemetry ? {
            ...activeTelemetry,
            processingTimeMs: Math.max(1, Date.now() - commentaryStartTime)
          } : undefined
        }, { status: 500 });
      }
      return NextResponse.json({
        ...commentary,
        source: commentarySource,
        synthesisGenerated: true,
        sourceStatus: sourceStatusSnapshot(),
        telemetry: activeTelemetry ? {
          ...activeTelemetry,
          processingTimeMs: Math.max(1, Date.now() - commentaryStartTime)
        } : {
          pathUsed: commentarySource,
          fallbackTriggered: commentarySource === "deterministic",
          failedGates: 0,
          processingTimeMs: Math.max(1, Date.now() - commentaryStartTime),
          llmAvailable: !!KEY
        },
        confidenceSummary,
        ...(commentarySource === "deterministic"
          ? {
              notice:
                "Evidence synthesis structured directly from peer-reviewed literature and verified against Vancouver citation standards."
            }
          : {}),
        fetchedReferences: curatedRecords,
        additionalEvidence,
        contextualReferences: contextualPool,
        retainedCount: directPool.length,
        retrievedCount: refPool.length,
        excludedCount: excludedByClaim.length,
        excludedReferences: excludedByClaim.map(e => ({
          pmid: e.ref.pmid, title: e.ref.title, reason: e.reason,
          url: safeUrl(e.ref.url, `https://pubmed.ncbi.nlm.nih.gov/${e.ref.pmid}/`)
        })),
droppedReferences: droppedRefs,
        removedCitations,
        evidenceWarnings,
        claimWarnings,
        claimAudit: finalized.claims,
        canonicalCitationKeys: Array.from(evidenceSet.allowedCitationKeys),
        noDirectEvidence,
refAudit: directPool.map(r => auditRef(r, elements)),
        paperRefAudit,
        citationChecks,
        integrity,
        quality
      });
    }

    if (stage === "gap") {
      resetSourceStatus();
      const parsedTopic = readFreeText(body.input, "input");
      if (!parsedTopic.ok) return parsedTopic.response;
      const topic = parsedTopic.text;
      const explicitGapSpec = isSpecialty((body as { specialty?: string })?.specialty)
        ? ((body as { specialty?: SpecialtyKey }).specialty)
        : undefined;
      const scenario = parseClinicalScenario(topic, explicitGapSpec);
      const activeGapSpec = scenario.specialty || (explicitGapSpec ? explicitGapSpec : "internal_med");
      const activeGapDef = getSpecialtyDefinition(activeGapSpec);

      let gapAnalysis: Record<string, unknown> | null = null;
      let gapSource: "ai" | "deterministic" = "deterministic";

      if (hasAnyLlmKey()) {
        try {
          gapAnalysis = await callLLM(
            `You are an evidence-mapping engine for ${activeGapDef.label} with strict scientific editorial standards.

TASK: Given a clinical topic, map the current evidence landscape.

CLINICAL TOPIC DECOMPOSITION:
- Specialty: ${scenario.specialty} (${activeGapDef.label})
- Clinical Population / Condition (P): ${scenario.population}
- Primary Intervention (I): ${scenario.intervention}
- Comparison / Control (C): ${scenario.comparator}
- Candidate Clinical Endpoints (O): ${scenario.outcomes.join(", ")}

HARD RULES:
1. Standard medical spelling and terminology ONLY. This is a scientific deliverable: correct spelling is mandatory. Example: "laparoscopic treatment" (never "laparurgical"), "hysterectomy" (never "hysterctmy"), "endometriosis" (never "endometriotis"). Before output, re-read your own response and correct any typo or malformed term.
2. EXACT item counts, no more and no fewer:
   - known: EXACTLY 4 points that are settled by robust, high-quality evidence (meta-analyses, systematic reviews, large RCTs). Each: {point, searchQuery}. searchQuery must be 3-6 words of DISTINCTIVE keywords for that specific claim so a PubMed search returns papers supporting THAT claim, not the general topic.
   - uncertain: EXACTLY 4 areas where evidence is conflicting or low-quality. Each: {point, searchQuery} same format.
   - gaps: EXACTLY 4 genuine research gaps. Each: {gap, why}, where why briefly explains why the gap matters clinically.
   - suggestedQuestions: EXACTLY 4 answerable PICO-format research questions targeting the most important gaps. Each: {question, rationale}.
      STRICT PICO SEPARATION: Each question must strictly separate Population (P), Intervention (I), Comparator (C), and Outcome (O).
      Format: "In [Population/Condition ONLY] (P), does [Intervention ONLY] (I) compared with [Comparator ONLY] (C) [Verb Phrase] [Outcome ONLY] (O)?"
      MANDATORY:
      - (P) must contain ONLY the patient population (e.g. "${scenario.population}"). NEVER put intervention or comparator into (P).
      - (I) must contain ONLY the evaluated intervention (e.g. "${scenario.intervention}").
      - (C) must contain ONLY the comparison arm (e.g. "${scenario.comparator}").
      - (O) must contain ONLY the clinical endpoint.
3. Claim-strength calibration:
    - known may contain ONLY settled knowledge. Phrase every claim to match the strength of the evidence: use hedged, association-style wording ("is associated with", "the evidence shows", "meta-analyses support") unless multiple consistent high-level studies establish the effect, in which case stronger wording ("reduces", "increases") is acceptable. NEVER use absolute or definitive causal language ("is proven to", "demonstrably causes", "guaranteed") unless supported by multiple consistent high-level studies.
    - uncertain must state WHY the evidence conflicts or is low-quality (heterogeneous populations, small samples, inconsistent endpoints).
4. Reference integrity: the 8 evidence points must each carry a DISTINCT searchQuery targeting its own claim. Do not present study protocols, trial registrations, or conference abstracts as evidence of clinical effect.

Respond ONLY with valid JSON, no preamble or commentary.`,
            { topic }
          );
          gapSource = "ai";
        } catch (llmErr) {
          console.warn("[engine] LLM gap analysis failed, using deterministic fallback:", llmErr);
        }
      }

      if (!gapAnalysis) {
        gapAnalysis = generateDeterministicGapAnalysis(topic, explicitGapSpec) as unknown as Record<string, unknown>;
        gapSource = "deterministic";
      }

      interface RawGapPoint { point?: unknown; text?: unknown; searchQuery?: unknown }

      const normPoints = (arr: unknown): Array<{ point: string; searchQuery?: string }> =>
        Array.isArray(arr)
          ? arr
              .map((p): { point: string; searchQuery?: string } => {
                if (typeof p === "string") return { point: fixTerms(p) };
                const obj = p as RawGapPoint;
                const point = typeof obj?.point === "string" && obj.point ? obj.point : typeof obj?.text === "string" ? obj.text : "";
                return {
                  point: fixTerms(point),
                  searchQuery: typeof obj?.searchQuery === "string" && obj.searchQuery ? fixTerms(obj.searchQuery) : undefined
                };
              })
              .map(x => ({ ...x, point: x.point.replace(/\s+/g, " ").trim() }))
              .filter(x => x.point.length > 0)
          : [];

      if (!Array.isArray(gapAnalysis.suggestedQuestions) || gapAnalysis.suggestedQuestions.length === 0) {
        gapAnalysis.suggestedQuestions = scenario.suggestedQuestions;
      }
      interface RawGapItem { gap?: unknown; why?: unknown }
      interface RawSuggestion { question?: unknown; rationale?: unknown }
      if (Array.isArray(gapAnalysis.gaps)) {
        gapAnalysis.gaps = gapAnalysis.gaps
          .map((g: RawGapItem) => ({
            gap: fixTerms(String(g?.gap || "")).replace(/\s+/g, " ").trim(),
            why: fixTerms(String(g?.why || "")).replace(/\s+/g, " ").trim()
          }))
          .filter(g => g.gap.length > 0);
      }
      if (!Array.isArray(gapAnalysis.gaps) || gapAnalysis.gaps.length === 0) {
        gapAnalysis.gaps = [{ gap: "Primary evidence gap under investigation", why: "Confirm specific gaps with a focused literature review." }];
      }
      if (Array.isArray(gapAnalysis.suggestedQuestions)) {
        const sqList: Array<{ question: string; rationale: string }> = gapAnalysis.suggestedQuestions
          .map((s: RawSuggestion) => ({
            question: fixTerms(String(s?.question || "")).replace(/\s+/g, " ").trim(),
            rationale: fixTerms(String(s?.rationale || "")).replace(/\s+/g, " ").trim()
          }))
          .filter(s => s.question.length > 0);

        // Sanity check: Ensure strict PICO separation and no mixing of P, I, C
        const isMalformed = (sq: { question: string }) => {
          const q = sq.question;
          if (!q.includes("(P)") || !q.includes("(I)") || !q.includes("(C)")) return true;
          const pMatch = q.match(/In\s+(.+?)\s+\(P\)/i);
          if (!pMatch) return true;
          const pText = pMatch[1].toLowerCase();
          // Detect if comma-separated tags or intervention words contaminated Population
          if (pText.includes(",") || pText.includes(scenario.intervention.toLowerCase()) || pText.includes(scenario.comparator.toLowerCase())) {
            return true;
          }
          return false;
        };

        const hasMalformed = sqList.length < 4 || sqList.some(isMalformed);
        gapAnalysis.suggestedQuestions = hasMalformed ? scenario.suggestedQuestions : sqList;
      }
      gapAnalysis.gaps = (Array.isArray(gapAnalysis.gaps) ? gapAnalysis.gaps : []).slice(0, 4);
      gapAnalysis.suggestedQuestions = (Array.isArray(gapAnalysis.suggestedQuestions) ? gapAnalysis.suggestedQuestions : []).slice(0, 4);
      gapAnalysis.specialty = isSpecialty(gapAnalysis.specialty) ? gapAnalysis.specialty : null;

      const knownPts = normPoints(gapAnalysis.known).slice(0, 4);
      const uncertainPts = normPoints(gapAnalysis.uncertain).slice(0, 4);

      // Literature sources are mandatory: any client-sent `sources` selection is ignored and
      // every database is searched (see fetchAllSources).

      const usedPmids = new Set<string>();
      // The typed tags, resolved into PICO roles, are what every attached paper must be about.
      const tagElements: PicoElement[] = [
        { label: "Population", value: scenario.population },
        { label: "Intervention", value: scenario.intervention },
        ...(/placebo|standard care|usual care|no treatment/i.test(scenario.comparator) ? [] : [{ label: "Comparator", value: scenario.comparator }]),
        { label: "Outcome", value: scenario.outcomes.slice(0, 3).join("; ") }
      ].filter(e => e.value && e.value.trim());
      let knownWithRefs: Array<{ point: string; references: PubMedRef[]; searchIncomplete?: boolean }> = [];
      let uncertainWithRefs: Array<{ point: string; references: PubMedRef[]; searchIncomplete?: boolean }> = [];
      try {
        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;
        const fetchPromise = fetchReferencesForPoints([...knownPts, ...uncertainPts], topic, usedPmids, tagElements);
        const timeoutPromise = new Promise<Array<{ point: string; references: PubMedRef[] }>>((resolve) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            console.warn("[engine] Reference fetching reached 12s budget, returning partial points");
            resolve([...knownPts, ...uncertainPts].map(p => ({ point: p.point, references: [] })));
          }, 12_000);
        });
        const all = await Promise.race([
          fetchPromise.then(res => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            return res;
          }),
          timeoutPromise
        ]);
        const allMapped = all.map(p => ({
          ...p,
          searchIncomplete: timedOut || !p.references || p.references.length === 0
        }));
        knownWithRefs = allMapped.slice(0, knownPts.length);
        uncertainWithRefs = allMapped.slice(knownPts.length);
      } catch (refErr) {
        console.warn("[engine] Reference fetching encountered an issue, returning points without external refs:", refErr);
        knownWithRefs = knownPts.map(p => ({ point: p.point, references: [], searchIncomplete: true }));
        uncertainWithRefs = uncertainPts.map(p => ({ point: p.point, references: [], searchIncomplete: true }));
      }
      
      return NextResponse.json({ 
        ...gapAnalysis, 
        topic,
        source: gapSource,
        known: knownWithRefs,
        uncertain: uncertainWithRefs,
        sourceStatus: sourceStatusSnapshot()
      });
    }

    if (stage === "intent") {
      const parsedInput = readFreeText(body.input, "input");
      if (!parsedInput.ok) return parsedInput.response;
      const input = parsedInput.text;
      if (KEY) {
        const out = await callLLM(
          `You are a clinical intent recognition engine for universal evidence-based medicine across all clinical specialties.
Given a clinician's raw, vague clinical uncertainty, identify:
- specialty: one of ${Object.keys(KB).join(", ")} (or null)
- condition: the clinical problem/population (empty string if unclear)
- intervention: treatment/test/exposure mentioned (empty string if none)
- comparator: comparison mentioned (empty string if none)
- questionType and framework chosen from: ${JSON.stringify(QUESTION_TYPES)}
- missing: list of missing PICO elements from ["condition","intervention","comparator","outcome"]
- interpretation: one sentence explaining your reading of the uncertainty.
Respond ONLY with JSON.`, { input, knowledgeBase: kbContext() });
        const r = out as unknown as Analysis;
        const valid = isSpecialty(r.specialty);
        return NextResponse.json({
          ...r,
          specialty: valid ? r.specialty : null,
          source: "ai",
          specialtyLabel: valid ? KB[r.specialty as keyof typeof KB].label : "Unknown"
        });
      }
      return NextResponse.json(ruleAnalyze(input));
    }

    if (stage === "clarify") {
      const parsed = readAnalysisStage(body, stage);
      if (!parsed.ok) return parsed.response;
      const { analysis, answered } = parsed;

      // The deterministic selection is computed first and is the authority for the outcome field.
      // The model may only reorder it; it can never introduce, rename or invent an option.
      const deterministic = ruleClarify(analysis, answered);

      if (deterministic.field !== "outcome") {
        if (KEY && analysis?.specialty && isSpecialty(analysis.specialty)) {
          const out = await callLLM(
            `You are an interactive clinical clarification assistant for ${KB[analysis.specialty as keyof typeof KB].label}.
The clinician's original uncertainty and the current analysis are given. Ask the SINGLE most important next clarification question needed to formulate an answerable clinical question.
Prefer asking about: outcome specificity first, then population details, then comparator.
Provide 4 to 6 diverse, clinically relevant options so the clinician has real choices.
Respond ONLY with JSON:
{"done": false, "field": "<condition|intervention|comparator|outcome>", "questionText": "...", "options": ["...", "..."], "allowFreeText": true}
Set done=true with empty strings when everything essential is known.`,
            { analysis, answered }
          );
          return NextResponse.json({ ...out, source: "ai" });
        }
        return NextResponse.json(deterministic);
      }

      const outcomeSelection = deterministic.outcomeSelection;
      if (!outcomeSelection || !(KEY && analysis?.specialty && isSpecialty(analysis.specialty))) {
        return NextResponse.json(deterministic);
      }

      const advisory = await callLLM(
        `You are helping a clinician choose the primary outcome for a clinical question.
These outcomes were selected for this question and are already ranked by clinical relevance:
${JSON.stringify(outcomeSelection.options.map(o => ({ id: o.id, label: o.label, category: o.category })), null, 1)}
Reorder them only if this specific question is clearly better served by a different order, and name the single outcome that should be the recommended primary.
You MUST use the ids exactly as given. You MUST NOT invent, rename, or add outcomes.
Respond ONLY with JSON:
{"recommendedOutcomeId": "<id from the list>", "options": ["<id>", "..."]}`,
        { analysis, answered, question: deterministic.questionText }
      );
      const advised = applyOutcomeAdvisory(outcomeSelection, advisory);
      return NextResponse.json({
        ...deterministic,
        questionText: typeof advisory === "object" && advisory && typeof (advisory as { questionText?: unknown }).questionText === "string"
          ? String((advisory as { questionText: string }).questionText).slice(0, 600)
          : deterministic.questionText,
        options: advised.options.map(o => o.label),
        outcomeSelection: advised,
        source: advised.source
      });
    }

    if (stage === "formulate") {
      const parsed = readAnalysisStage(body, stage);
      if (!parsed.ok) return parsed.response;
      const { analysis, answered } = parsed;

      // Ensure condition, intervention and comparator are populated from question/topic if missing
      const textToExtract = String(body.selectedQuestion || analysis.interpretation || body.topic || "").trim();
      if ((!answered.condition && !analysis.condition) || (!answered.intervention && !analysis.intervention)) {
        if (textToExtract) {
          const recovered = extractPicoFromQuestion(textToExtract, String(body.topic || ""));
          if (!answered.condition && !analysis.condition) {
            analysis.condition = recovered.condition;
            answered.condition = recovered.condition;
          }
          if (!answered.intervention && !analysis.intervention) {
            analysis.intervention = recovered.intervention;
            answered.intervention = recovered.intervention;
          }
          if (!answered.comparator && !analysis.comparator) {
            analysis.comparator = recovered.comparator;
            answered.comparator = recovered.comparator;
          }
          if (!analysis.specialty) {
            analysis.specialty = recovered.specialty;
          }
        }
      }

      if (KEY && analysis?.specialty && isSpecialty(analysis.specialty)) {
        const outcomeLogic = rationalOutcomes(answered.condition || analysis.condition || "", analysis.specialty);
        const out = await callLLM(
          `You are a clinical question formulation engine for evidence-based medicine in ${analysis.specialty ? (KB[analysis.specialty]?.label || "Clinical Medicine") : "Clinical Medicine"}.
Using the analysis and clarified answers, produce:
- framework: the question framework name
- elements: array of {label, value} for each framework element (PICO/PICOT/PECO/diagnostic)
- finalQuestion: ONE polished, answerable clinical question sentence (the recommended default)
- variants: EXACTLY 4 alternative formulations of the question, each {question, rationale} where rationale (one short sentence) explains the different clinical angle — vary by primary outcome, population detail, or comparator. Variant 1 may equal finalQuestion.
- scores: array of {name, value} scoring each element 0-20 plus Specificity (max total = number of items x 20). Score the outcome element HIGHEST (18-20) when it matches the recommended primary outcome.
- advisories: array of short warnings; if the selected outcome is not the most patient-centered for the condition, flag it and recommend "${outcomeLogic.primary}" (rationale: ${outcomeLogic.rationale}).
- searchTerms: {population, intervention, outcome} optimized for PubMed searching.
Respond ONLY with JSON.`,
          { analysis, answered, specialtyKnowledge: analysis.specialty ? KB[analysis.specialty] : null, outcomeLogic }
        );
        return NextResponse.json({ ...out, source: "ai", complete: true, missingElements: [] });
      }
      return formulated(ruleFormulate(analysis, answered));
    }

    return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
  } catch (e) {
    // Never swallow this silently: an unexplained 503 is impossible to diagnose in production.
    console.error(`[engine] stage "${stage}" failed:`, e);
    // The rule-based fallbacks run *inside* this catch, so a failure in a fallback used to
    // escape it entirely and surface as a bare HTTP 500 with a zero-byte body: no message for the
    // user and nothing for alerting to read. Each fallback is now guarded on its own and
    // degrades to the same structured 503, so a double failure is reported honestly instead of
    // crashing the request.
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
    if (stage === "intent") {
      try {
        return NextResponse.json(ruleAnalyze(typeof body.input === "string" ? body.input : ""));
      } catch (fallbackError) {
        console.error(`[engine] rule fallback for "intent" also failed:`, fallbackError);
      }
    }
    if (stage === "gap") {
      try {
        const topic = typeof body.input === "string" ? body.input : "";
        const explicitSpec = isSpecialty((body as { specialty?: string })?.specialty) ? ((body as { specialty?: SpecialtyKey }).specialty) : undefined;
        const fallback = generateDeterministicGapAnalysis(topic, explicitSpec);
        return NextResponse.json({
          ...fallback,
          topic,
          source: "deterministic",
          known: fallback.known.map(k => ({ point: k.point, references: [] })),
          uncertain: fallback.uncertain.map(u => ({ point: u.point, references: [] }))
        });
      } catch (fallbackError) {
        console.error(`[engine] rule fallback for "gap" also failed:`, fallbackError);
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
    if (stage === "clarify" || stage === "formulate") {
      const analysis = body.analysis;
      if (analysis && typeof analysis === "object" && !Array.isArray(analysis)) {
        try {
          const answered =
            body.answered && typeof body.answered === "object" && !Array.isArray(body.answered)
              ? (body.answered as Record<string, string>)
              : {};
          return stage === "clarify"
            ? NextResponse.json(ruleClarify(analysis as Analysis, answered))
            : formulated(ruleFormulate(analysis as Analysis, answered));
        } catch (fallbackError) {
          console.error(`[engine] rule fallback for "${stage}" also failed:`, fallbackError);
        }
      }
    }
    return NextResponse.json(
      { error: "The AI service is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}
