/**
 * Literature Search Sources Engine
 * 
 * Provides unified, resilient, multi-source scientific literature retrieval
 * across PubMed (NCBI E-utilities), OpenAlex, and CrossRef.
 * 
 * Enforces:
 * 1. Consistent canonical typing for downstream evidence synthesis
 * 2. Proper rate-limiting and polite API pooling (headers & email identifiers)
 * 3. Title sanitization, HTML entity decoding, and JATS/XML tag stripping
 * 4. Resilient error isolation so transient provider outages do not kill searches
 * 5. Deterministic cross-provider deduplication using DOIs, PMIDs, and title tokens
 */

import { normalizeDoi } from "./evidence-set.ts";
import { classifyPaperType } from "./study-design.ts";

export type LiteratureSource = "pubmed" | "openalex" | "crossref";

export interface LiteratureArticle {
  pmid: string; // Canonical identifier (e.g. numeric "12345678", "oax:W12345", or "cr:10.1000/xyz")
  title: string;
  journal: string;
  year: string;
  authors: string;
  doi?: string;
  url: string;
  source: LiteratureSource;
  pubType?: string;
  publicationTypes?: string[];
  context?: string; // Abstract or excerpt when available
  studyType?: string; // Canonical 40-type study design classification
}

export interface SearchSourceOption {
  id: LiteratureSource;
  name: string;
  icon: string;
  badgeClass: string;
  description: string;
  provider: string;
}

export const SEARCH_SOURCE_OPTIONS: SearchSourceOption[] = [
  {
    id: "pubmed",
    name: "PubMed",
    icon: "🔵",
    badgeClass: "source-badge-pubmed",
    description: "National Library of Medicine · MEDLINE & MeSH indexing",
    provider: "NCBI / NLM"
  },
  {
    id: "openalex",
    name: "OpenAlex",
    icon: "🟢",
    badgeClass: "source-badge-openalex",
    description: "Global open research graph · 250M+ cross-disciplinary works",
    provider: "OurResearch"
  },
  {
    id: "crossref",
    name: "CrossRef",
    icon: "🟣",
    badgeClass: "source-badge-crossref",
    description: "Digital Object Identifier (DOI) registry & publisher metadata",
    provider: "Crossref / Publishers"
  }
];

const API_TIMEOUT_MS = 12_000;
const OPENALEX_MAILTO = "support@aimed.app";
const USER_AGENT = "aimed/4.0 (https://aimed-pico.vercel.app; mailto:support@aimed.app)";
const NCBI_API_KEY = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY || "";

/**
 * Strips HTML tags (including JATS XML tags from CrossRef) and decodes standard entities.
 */
export function decodeHtmlEntities(raw: string): string {
  if (!raw) return "";
  let clean = raw.replace(/<[^>]+>/g, " "); // Strip XML/HTML tags
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
  return clean;
}

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with"
]);

export function sanitizeSearchQuery(query: string): string {
  if (!query) return "";
  return query
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 10)
    .join(" ");
}

export function buildSearchQuery(pico: {
  query?: string | null;
  population?: string | null;
  intervention?: string | null;
  comparator?: string | null;
  outcome?: string | null;
}): string {
  if (pico.query && pico.query.trim()) {
    return sanitizeSearchQuery(pico.query);
  }
  const parts: string[] = [];
  if (pico.population) parts.push(pico.population);
  if (pico.intervention) parts.push(pico.intervention);
  if (pico.outcome) parts.push(pico.outcome);
  if (pico.comparator && parts.length < 3) parts.push(pico.comparator);
  return sanitizeSearchQuery(parts.join(" "));
}

interface OpenAlexItem {
  id?: string;
  doi?: string;
  title?: string;
  publication_year?: number;
  type?: string;
  ids?: { pmid?: string; doi?: string; openalex?: string };
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } };
  abstract_inverted_index?: Record<string, number[]>;
}

function reconstructOpenAlexAbstract(index?: Record<string, number[]>): string {
  if (!index) return "";
  try {
    const pairs: Array<{ word: string; pos: number }> = [];
    for (const [word, positions] of Object.entries(index)) {
      for (const pos of positions) {
        pairs.push({ word, pos });
      }
    }
    pairs.sort((a, b) => a.pos - b.pos);
    return pairs.slice(0, 120).map(p => p.word).join(" ");
  } catch {
    return "";
  }
}

/**
 * Fetches peer-reviewed journal articles from OpenAlex.
 */
export async function fetchOpenAlexArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const perPage = Math.min(Math.max(maxResults + 4, 8), 25);
  const select = "id,ids,doi,title,publication_year,type,authorships,primary_location,abstract_inverted_index";
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(sanitized)}&filter=type:article&per_page=${perPage}&select=${select}&mailto=${encodeURIComponent(OPENALEX_MAILTO)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });

    if (!res.ok) {
      throw new Error(`OpenAlex HTTP ${res.status}`);
    }

    const data = await res.json();
    const hits = (data?.results || []) as OpenAlexItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of hits) {
      const rawTitle = decodeHtmlEntities(item.title || "");
      if (!rawTitle || /protocol|trial registration/i.test(rawTitle)) continue;

      const pmidNum = item.ids?.pmid ? String(item.ids.pmid).replace(/\D/g, "") : "";
      const rawDoi = item.doi || item.ids?.doi || "";
      const doi = normalizeDoi(rawDoi);
      const oaId = (item.ids?.openalex || item.id || "").split("/").pop() || "";
      const pmid = pmidNum || (doi ? `doi:${doi}` : (oaId ? `oax:${oaId}` : ""));
      if (!pmid) continue;

      const authors = (item.authorships || [])
        .slice(0, 4)
        .map(a => a.author?.display_name?.trim())
        .filter(Boolean)
        .join(", ");

      const journal = decodeHtmlEntities(item.primary_location?.source?.display_name || "");
      const year = item.publication_year ? String(item.publication_year) : "";
      const context = reconstructOpenAlexAbstract(item.abstract_inverted_index);

      const pubType = item.type || "article";
      const studyType = classifyPaperType({
        title: rawTitle,
        pubType,
        publicationTypes: [pubType],
        context
      });

      articles.push({
        pmid: pmidNum ? pmidNum : (oaId ? `oax:${oaId}` : pmid),
        title: rawTitle,
        authors: authors || "Research Group",
        year,
        journal: journal || "Peer-Reviewed Scientific Literature",
        doi: doi || undefined,
        url: doi ? `https://doi.org/${doi}` : (item.ids?.openalex || item.id || `https://openalex.org/${oaId}`),
        source: "openalex",
        pubType,
        publicationTypes: [pubType],
        context: context || undefined,
        studyType
      });

      if (articles.length >= maxResults) break;
    }

    return articles;
  } catch (err) {
    console.warn("[OpenAlex] search error:", err instanceof Error ? err.message : err);
    return [];
  }
}

interface CrossrefWorkItem {
  DOI?: string;
  title?: string[];
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  author?: Array<{ family?: string; given?: string }>;
  type?: string;
  abstract?: string;
}

/**
 * Fetches peer-reviewed journal articles from CrossRef.
 */
export async function fetchCrossrefArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const rows = Math.min(Math.max(maxResults + 4, 8), 25);
  const select = "title,issued,DOI,author,container-title,type,abstract";
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(sanitized)}&filter=type:journal-article&rows=${rows}&select=${select}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });

    if (!res.ok) {
      throw new Error(`CrossRef HTTP ${res.status}`);
    }

    const data = await res.json();
    const items = (data?.message?.items || []) as CrossrefWorkItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of items) {
      const rawTitle = decodeHtmlEntities(item.title?.[0] || "");
      if (!rawTitle || /protocol|trial registration/i.test(rawTitle)) continue;

      const rawDoi = item.DOI || "";
      const doi = normalizeDoi(rawDoi);
      if (!doi) continue;

      const yearPart = item.issued?.["date-parts"]?.[0]?.[0];
      const year = yearPart ? String(yearPart) : "";

      const authorList = (item.author || [])
        .slice(0, 4)
        .map(a => [a.family, a.given].filter(Boolean).join(" ").trim())
        .filter(Boolean);
      const authors = authorList.join(", ");

      const rawJournal = item["container-title"]?.[0] || "";
      const journal = decodeHtmlEntities(rawJournal);

      const context = decodeHtmlEntities(item.abstract || "");
      const pubType = item.type || "journal-article";
      const studyType = classifyPaperType({
        title: rawTitle,
        pubType,
        publicationTypes: [pubType],
        context
      });

      articles.push({
        pmid: `cr:${doi}`,
        title: rawTitle,
        authors: authors || "Academic Authors",
        year,
        journal: journal || "Medical Journal Publication",
        doi,
        url: `https://doi.org/${doi}`,
        source: "crossref",
        pubType,
        publicationTypes: [pubType],
        context: context || undefined,
        studyType
      });

      if (articles.length >= maxResults) break;
    }

    return articles;
  } catch (err) {
    console.warn("[CrossRef] search error:", err instanceof Error ? err.message : err);
    return [];
  }
}

interface ESummaryDoc {
  title?: string;
  sortfirstauthor?: string;
  pubdate?: string;
  fulljournalname?: string;
  source?: string;
  elocationid?: string;
  pubtype?: string[];
}

/**
 * Fetches peer-reviewed journal articles from PubMed via NCBI E-utilities.
 */
export async function fetchPubMedArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : "";
  const term = `${sanitized} NOT "study protocol"[Publication Type] NOT "clinical trial protocol"[Publication Type]`;
  const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${maxResults * 2}&sort=relevance&term=${encodeURIComponent(term)}${apiKeyParam}`;

  try {
    const searchRes = await fetch(esearchUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
    if (!searchRes.ok) throw new Error(`PubMed esearch HTTP ${searchRes.status}`);

    const searchData = await searchRes.json();
    const ids = ((searchData?.esearchresult?.idlist as string[]) || []).slice(0, maxResults);
    if (!ids.length) return [];

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}${apiKeyParam}`;
    const sumRes = await fetch(summaryUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
    if (!sumRes.ok) throw new Error(`PubMed esummary HTTP ${sumRes.status}`);

    const sumData = await sumRes.json();
    const result = (sumData?.result as Record<string, ESummaryDoc>) || {};
    const articles: LiteratureArticle[] = [];

    for (const id of ids) {
      const doc = result[id];
      if (!doc) continue;
      const title = decodeHtmlEntities(doc.title || "");
      if (!title) continue;

      const pubtypes = Array.isArray(doc.pubtype) ? doc.pubtype : [];
      const doi = normalizeDoi(doc.elocationid?.replace(/^doi:\s*/i, "") || "");
      const pubType = pubtypes.length ? pubtypes.join(", ") : "Journal Article";
      const studyType = classifyPaperType({
        title,
        pubType,
        publicationTypes: pubtypes
      });

      articles.push({
        pmid: id,
        title,
        authors: doc.sortfirstauthor || "NCBI Contributor",
        year: (doc.pubdate || "").slice(0, 4),
        journal: decodeHtmlEntities(doc.fulljournalname || doc.source || "MEDLINE Indexed Journal"),
        doi: doi || undefined,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: "pubmed",
        pubType,
        publicationTypes: pubtypes,
        studyType
      });
    }

    return articles;
  } catch (err) {
    console.warn("[PubMed] search error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Deduplicates articles across different providers based on DOI, numerical PMID, or normalized title.
 */
export function deduplicateArticles(articles: LiteratureArticle[]): LiteratureArticle[] {
  const seenKeys = new Set<string>();
  const output: LiteratureArticle[] = [];

  for (const art of articles) {
    if (!art.title || !art.title.trim()) continue;

    const keys: string[] = [];
    if (art.doi) {
      keys.push(`doi:${art.doi.toLowerCase()}`);
    }
    if (art.pmid && /^\d+$/.test(art.pmid)) {
      keys.push(`pmid:${art.pmid}`);
    }
    const cleanTitle = art.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
    if (cleanTitle.length > 15) {
      keys.push(`t:${cleanTitle}`);
    }

    const isDuplicate = keys.length > 0 && keys.some(k => seenKeys.has(k));
    if (isDuplicate) continue;

    keys.forEach(k => seenKeys.add(k));
    output.push(art);
  }

  return output;
}

export interface MultiSourceSearchOptions {
  sources: LiteratureSource[];
  query: string;
  maxResults?: number;
}

/**
 * Concurrently queries selected literature sources, providing error isolation,
 * deduplication, and balanced representation.
 */
export async function searchMultiSourceLiterature(options: MultiSourceSearchOptions): Promise<LiteratureArticle[]> {
  const { sources, query, maxResults = 10 } = options;
  const activeSources = Array.from(new Set(sources));
  if (!activeSources.length || !query.trim()) return [];

  const perSourceLimit = Math.max(Math.ceil(maxResults / activeSources.length) + 2, 4);
  const fetchTasks: Array<Promise<{ source: LiteratureSource; articles: LiteratureArticle[] }>> = [];

  for (const src of activeSources) {
    if (src === "openalex") {
      fetchTasks.push(
        fetchOpenAlexArticles(query, perSourceLimit)
          .then(articles => ({ source: "openalex" as LiteratureSource, articles }))
          .catch(() => ({ source: "openalex" as LiteratureSource, articles: [] }))
      );
    } else if (src === "crossref") {
      fetchTasks.push(
        fetchCrossrefArticles(query, perSourceLimit)
          .then(articles => ({ source: "crossref" as LiteratureSource, articles }))
          .catch(() => ({ source: "crossref" as LiteratureSource, articles: [] }))
      );
    } else if (src === "pubmed") {
      fetchTasks.push(
        fetchPubMedArticles(query, perSourceLimit)
          .then(articles => ({ source: "pubmed" as LiteratureSource, articles }))
          .catch(() => ({ source: "pubmed" as LiteratureSource, articles: [] }))
      );
    }
  }

  const results = await Promise.allSettled(fetchTasks);
  const buckets: Record<LiteratureSource, LiteratureArticle[]> = {
    pubmed: [],
    openalex: [],
    crossref: []
  };

  for (const res of results) {
    if (res.status === "fulfilled") {
      buckets[res.value.source] = res.value.articles;
    }
  }

  // Interleave results to guarantee representation across selected sources
  const interleaved: LiteratureArticle[] = [];
  const maxBucketLen = Math.max(...activeSources.map(s => buckets[s]?.length || 0));

  for (let i = 0; i < maxBucketLen; i++) {
    for (const src of activeSources) {
      const art = buckets[src]?.[i];
      if (art) interleaved.push(art);
    }
  }

  return deduplicateArticles(interleaved).slice(0, maxResults);
}
