/**
 * Literature Search Sources Engine
 * 
 * Provides unified, resilient, multi-source scientific literature retrieval
 * across PubMed, PMC (PubMed Central), Europe PMC, Google Scholar, Semantic Scholar,
 * OpenAlex, CrossRef and DOAJ.
 *
 * Every source is MANDATORY: each search queries all of them, there is no user choice
 * (see ALL_LITERATURE_SOURCES / resolveMandatorySources). Results are merged and
 * cross-provider duplicates are dropped, so the same paper is never listed twice.
 *
 * Google Scholar has no official API and blocks automated scraping, so it is reached
 * through SerpApi's Google Scholar endpoint (free plan available) when SERPAPI_API_KEY
 * is configured. Without the key that one source is skipped and the others still run.
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

export type LiteratureSource =
  | "pubmed"
  | "pmc"
  | "europepmc"
  | "googlescholar"
  | "semanticscholar"
  | "openalex"
  | "crossref"
  | "doaj";

export interface LiteratureArticle {
  pmid: string; // Canonical identifier (e.g. numeric "12345678", "pmc:PMC1234", "s2:abc", "oax:W12345", or "cr:10.1000/xyz")
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
    id: "pmc",
    name: "PMC (PubMed Central)",
    icon: "🟡",
    badgeClass: "source-badge-pmc",
    description: "Full-text open access biomedical repository · Europe PMC",
    provider: "NLM / Europe PMC"
  },
  {
    id: "europepmc",
    name: "Europe PMC",
    icon: "🇪🇺",
    badgeClass: "source-badge-europepmc",
    description: "MEDLINE, PMC, preprints, Agricola & patents · 45M+ life-science records",
    provider: "EMBL-EBI"
  },
  {
    id: "googlescholar",
    name: "Google Scholar",
    icon: "🎓",
    badgeClass: "source-badge-googlescholar",
    description: "Broad scholarly index incl. grey literature & theses (via SerpApi)",
    provider: "Google · SerpApi"
  },
  {
    id: "semanticscholar",
    name: "Semantic Scholar",
    icon: "🟠",
    badgeClass: "source-badge-semanticscholar",
    description: "AI-powered scientific graph · 200M+ academic publications",
    provider: "Allen Institute for AI"
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
  },
  {
    id: "doaj",
    name: "DOAJ",
    icon: "🔓",
    badgeClass: "source-badge-doaj",
    description: "Directory of Open Access Journals · peer-reviewed OA articles",
    provider: "DOAJ / IS4OA"
  }
];

/** Every literature source. All of them are searched on every request - none is optional. */
export const ALL_LITERATURE_SOURCES: LiteratureSource[] = SEARCH_SOURCE_OPTIONS.map(o => o.id);

/** Kept for existing imports; identical to ALL_LITERATURE_SOURCES because every source is mandatory. */
export const DEFAULT_LITERATURE_SOURCES: LiteratureSource[] = ALL_LITERATURE_SOURCES;

/**
 * Sources are mandatory, so whatever a client sends (an old saved selection, a subset, junk)
 * the search always runs against every source.
 */
export function resolveMandatorySources(): LiteratureSource[] {
  return [...ALL_LITERATURE_SOURCES];
}

const API_TIMEOUT_MS = 12_000;
const OPENALEX_MAILTO = process.env.OPENALEX_MAILTO || "raouf.roshdy@gmail.com";
const USER_AGENT = "aimed/4.0 (https://aimed-pico.vercel.app; mailto:raouf.roshdy@gmail.com)";
const NCBI_API_KEY = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY || "";
const S2_API_KEY = process.env.S2_API_KEY || "";
const serpApiKey = (): string => process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || "";

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
  const openAlexApiKey = process.env.OPENALEX_API_KEY || "";
  let url = `https://api.openalex.org/works?search=${encodeURIComponent(sanitized)}&filter=type:article&per_page=${perPage}&select=${select}&mailto=${encodeURIComponent(OPENALEX_MAILTO)}`;
  if (openAlexApiKey) {
    url += `&api_key=${encodeURIComponent(openAlexApiKey)}`;
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    };
    if (openAlexApiKey) {
      headers["Authorization"] = `Bearer ${openAlexApiKey}`;
    }
    const res = await fetch(url, {
      headers,
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

interface S2PaperItem {
  paperId: string;
  title?: string;
  venue?: string;
  year?: number;
  authors?: Array<{ name?: string }>;
  abstract?: string;
  publicationTypes?: string[];
  externalIds?: {
    DOI?: string;
    PubMed?: string;
    PubMedCentral?: string;
  };
}

async function fetchS2WithRetry(url: string, headers: Record<string, string>, attempts = 3): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (res.status !== 429 && res.status !== 503) return res;
    lastStatus = res.status;
    if (attempt < attempts - 1) {
      const ra = Number(res.headers.get("retry-after"));
      const backoff = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      const delay = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : backoff;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Semantic Scholar throttled (${lastStatus})`);
}

/**
 * Fetches scientific papers from Semantic Scholar (Allen Institute for AI).
 * Automatically fails over to unauthenticated polite pool if the configured API key is rate-limited.
 */
export async function fetchSemanticScholarArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const limit = Math.min(Math.max(maxResults + 4, 8), 25);
  const fields = "paperId,title,authors,year,venue,externalIds,abstract,publicationTypes";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(sanitized)}&limit=${limit}&fields=${fields}`;

  const getHeaders = (useKey: boolean) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    };
    if (useKey && S2_API_KEY) {
      headers["x-api-key"] = S2_API_KEY;
    }
    return headers;
  };

  try {
    let res: Response;
    if (S2_API_KEY) {
      try {
        res = await fetchS2WithRetry(url, getHeaders(true));
        if (res.status === 401 || res.status === 403) {
          res = await fetchS2WithRetry(url, getHeaders(false));
        }
      } catch {
        res = await fetchS2WithRetry(url, getHeaders(false));
      }
    } else {
      res = await fetchS2WithRetry(url, getHeaders(false));
    }

    if (!res.ok) {
      throw new Error(`Semantic Scholar HTTP ${res.status}`);
    }

    const data = await res.json();
    const hits = (data?.data || []) as S2PaperItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of hits) {
      const rawTitle = decodeHtmlEntities(item.title || "");
      if (!rawTitle || /protocol|trial registration/i.test(rawTitle)) continue;

      const rawDoi = item.externalIds?.DOI || "";
      const doi = normalizeDoi(rawDoi);
      const pmidNum = item.externalIds?.PubMed ? String(item.externalIds.PubMed).replace(/\D/g, "") : "";
      const pmid = pmidNum || (doi ? `doi:${doi}` : `s2:${item.paperId}`);

      const authors = (item.authors || [])
        .slice(0, 4)
        .map(a => a.name?.trim())
        .filter(Boolean)
        .join(", ");

      const journal = decodeHtmlEntities(item.venue || "");
      const year = item.year ? String(item.year) : "";
      const context = decodeHtmlEntities(item.abstract || "");

      const pubTypes = item.publicationTypes || ["Journal Article"];
      const studyType = classifyPaperType({
        title: rawTitle,
        pubType: pubTypes[0],
        publicationTypes: pubTypes,
        context
      });

      articles.push({
        pmid,
        title: rawTitle,
        authors: authors || "Research Authors",
        year,
        journal: journal || "Peer-Reviewed Literature",
        doi: doi || undefined,
        url: doi ? `https://doi.org/${doi}` : `https://www.semanticscholar.org/paper/${item.paperId}`,
        source: "semanticscholar",
        pubType: pubTypes.join(", "),
        publicationTypes: pubTypes,
        context: context || undefined,
        studyType
      });

      if (articles.length >= maxResults) break;
    }

    return articles;
  } catch (err) {
    console.warn("[Semantic Scholar] search error:", err instanceof Error ? err.message : err);
    return [];
  }
}

interface EuropePmcItem {
  id: string;
  source: string;
  pmcid?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  journalTitle?: string;
  journalInfo?: { journal?: { title?: string } };
  abstractText?: string;
  pubTypeList?: { pubType?: string | string[] } | null;
}

/**
 * Fetches peer-reviewed open access papers from PubMed Central (PMC) via Europe PMC.
 */
export async function fetchPmcArticles(query: string, maxResults = 6, questionType?: string): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const pageSize = Math.min(Math.max(maxResults + 4, 8), 50);
  // Focus query on PubMed Central and Open Access full text
  const isTherapy = questionType === "Therapy / Prevention" || questionType === "Therapy" || questionType === "Prevention";
  const rctFilter = isTherapy ? ' AND PUB_TYPE:"randomized controlled trial"' : "";
  const pmcFilterQuery = `${sanitized} AND (SRC:PMC OR OPEN_ACCESS:y)${rctFilter}`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(pmcFilterQuery)}&pageSize=${pageSize}&format=json&resultType=core`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });

    if (!res.ok) {
      throw new Error(`Europe PMC HTTP ${res.status}`);
    }

    const data = await res.json();
    const hits = (data?.resultList?.result || []) as EuropePmcItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of hits) {
      const rawTitle = decodeHtmlEntities(item.title || "");
      if (!rawTitle || /protocol|trial registration/i.test(rawTitle)) continue;

      const pmcid = item.pmcid ? item.pmcid.replace(/^PMC/i, "PMC") : "";
      const pmidNum = item.pmid ? String(item.pmid).replace(/\D/g, "") : "";
      const rawDoi = item.doi || "";
      const doi = normalizeDoi(rawDoi);

      // Prefer numerical PMID, then PMCID, then DOI
      const pmid = pmidNum || (pmcid ? `pmc:${pmcid}` : (doi ? `doi:${doi}` : `epmc:${item.id}`));

      const authors = decodeHtmlEntities(item.authorString || "PMC Authors");
      const journal = decodeHtmlEntities(item.journalTitle || item.journalInfo?.journal?.title || "PubMed Central Archive");
      const year = item.pubYear ? String(item.pubYear) : "";
      const context = decodeHtmlEntities(item.abstractText || "");

      const rawPubTypes = [item.pubTypeList?.pubType].flat().filter(Boolean) as string[];
      const pubTypes = rawPubTypes.length ? rawPubTypes : ["Journal Article"];
      const studyType = classifyPaperType({
        title: rawTitle,
        pubType: pubTypes[0],
        publicationTypes: pubTypes,
        context
      });

      const articleUrl = pmcid
        ? `https://europepmc.org/article/PMC/${pmcid}`
        : (doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmidNum}/`);

      articles.push({
        pmid,
        title: rawTitle,
        authors: authors.slice(0, 120),
        year,
        journal,
        doi: doi || undefined,
        url: articleUrl,
        source: "pmc",
        pubType: pubTypes.join(", "),
        publicationTypes: pubTypes,
        context: context || undefined,
        studyType
      });

      if (articles.length >= maxResults) break;
    }

    return articles;
  } catch (err) {
    console.warn("[PMC] search error:", err instanceof Error ? err.message : err);
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
export async function fetchPubMedArticles(query: string, maxResults = 6, questionType?: string): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : "";
  const isTherapy = questionType === "Therapy / Prevention" || questionType === "Therapy" || questionType === "Prevention";
  const rctFilter = isTherapy ? ' AND ("randomized controlled trial"[pt] OR "clinical trial"[pt] OR "controlled clinical trial"[pt])' : "";
  const term = `${sanitized}${rctFilter} NOT "study protocol"[Publication Type] NOT "clinical trial protocol"[Publication Type]`;
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

interface EuropePmcCoreItem extends EuropePmcItem {
  firstPublicationDate?: string;
}

/**
 * Fetches records from the whole Europe PMC index (MEDLINE, PMC, preprints, Agricola, patents),
 * not only the open-access subset that the "pmc" source covers.
 */
export async function fetchEuropePmcArticles(query: string, maxResults = 6, questionType?: string): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const pageSize = Math.min(Math.max(maxResults + 4, 8), 50);
  const isTherapy = questionType === "Therapy / Prevention" || questionType === "Therapy" || questionType === "Prevention";
  const rctFilter = isTherapy ? ' AND PUB_TYPE:"randomized controlled trial"' : "";
  const q = `${sanitized}${rctFilter}`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&pageSize=${pageSize}&format=json&resultType=core&sort=RELEVANCE`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`Europe PMC HTTP ${res.status}`);

    const data = await res.json();
    const hits = (data?.resultList?.result || []) as EuropePmcCoreItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of hits) {
      const rawTitle = decodeHtmlEntities(item.title || "");
      if (!rawTitle || /protocol|trial registration/i.test(rawTitle)) continue;

      const pmcid = item.pmcid || "";
      const pmidNum = item.pmid ? String(item.pmid).replace(/\D/g, "") : "";
      const doi = normalizeDoi(item.doi || "");
      const pmid = pmidNum || (pmcid ? `pmc:${pmcid}` : (doi ? `doi:${doi}` : `epmc:${item.source || "MED"}:${item.id}`));

      const rawPubTypes = [item.pubTypeList?.pubType].flat().filter(Boolean) as string[];
      const pubTypes = rawPubTypes.length ? rawPubTypes : ["Journal Article"];
      const context = decodeHtmlEntities(item.abstractText || "");
      const studyType = classifyPaperType({ title: rawTitle, pubType: pubTypes[0], publicationTypes: pubTypes, context });

      const articleUrl = pmidNum
        ? `https://europepmc.org/article/MED/${pmidNum}`
        : pmcid
          ? `https://europepmc.org/article/PMC/${pmcid}`
          : (doi ? `https://doi.org/${doi}` : `https://europepmc.org/article/${item.source || "MED"}/${item.id}`);

      articles.push({
        pmid,
        title: rawTitle,
        authors: decodeHtmlEntities(item.authorString || "Europe PMC Authors").slice(0, 120),
        year: item.pubYear ? String(item.pubYear) : (item.firstPublicationDate || "").slice(0, 4),
        journal: decodeHtmlEntities(item.journalTitle || item.journalInfo?.journal?.title || "Europe PMC Indexed Record"),
        doi: doi || undefined,
        url: articleUrl,
        source: "europepmc",
        pubType: pubTypes.join(", "),
        publicationTypes: pubTypes,
        context: context || undefined,
        studyType
      });

      if (articles.length >= maxResults) break;
    }
    return articles;
  } catch (err) {
    console.warn("[Europe PMC] search error:", err instanceof Error ? err.message : err);
    return [];
  }
}

interface DoajItem {
  id?: string;
  bibjson?: {
    title?: string;
    year?: string;
    abstract?: string;
    author?: Array<{ name?: string }>;
    journal?: { title?: string };
    identifier?: Array<{ type?: string; id?: string }>;
    link?: Array<{ type?: string; url?: string }>;
  };
}

/**
 * Fetches peer-reviewed open-access articles from the Directory of Open Access Journals.
 * Free, keyless API.
 */
export async function fetchDoajArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const pageSize = Math.min(Math.max(maxResults + 4, 8), 50);
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(sanitized)}?page=1&pageSize=${pageSize}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`DOAJ HTTP ${res.status}`);

    const data = await res.json();
    const hits = (data?.results || []) as DoajItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of hits) {
      const b = item.bibjson || {};
      const rawTitle = decodeHtmlEntities(b.title || "");
      if (!rawTitle || /protocol|trial registration/i.test(rawTitle)) continue;

      const doi = normalizeDoi((b.identifier || []).find(i => (i.type || "").toLowerCase() === "doi")?.id || "");
      const fullText = (b.link || []).find(l => (l.type || "").toLowerCase() === "fulltext")?.url || "";
      const id = item.id || "";
      if (!doi && !id) continue;

      const context = decodeHtmlEntities(b.abstract || "");
      const pubType = "Journal Article";
      const studyType = classifyPaperType({ title: rawTitle, pubType, publicationTypes: [pubType], context });

      articles.push({
        pmid: doi ? `doi:${doi}` : `doaj:${id}`,
        title: rawTitle,
        authors: (b.author || []).slice(0, 4).map(a => (a.name || "").trim()).filter(Boolean).join(", ") || "Open Access Authors",
        year: b.year ? String(b.year) : "",
        journal: decodeHtmlEntities(b.journal?.title || "Open Access Journal"),
        doi: doi || undefined,
        url: doi ? `https://doi.org/${doi}` : (/^https?:\/\//i.test(fullText) ? fullText : `https://doaj.org/article/${id}`),
        source: "doaj",
        pubType,
        publicationTypes: [pubType],
        context: context || undefined,
        studyType
      });

      if (articles.length >= maxResults) break;
    }
    return articles;
  } catch (err) {
    console.warn("[DOAJ] search error:", err instanceof Error ? err.message : err);
    return [];
  }
}

interface SerpScholarItem {
  result_id?: string;
  title?: string;
  link?: string;
  snippet?: string;
  publication_info?: { summary?: string; authors?: Array<{ name?: string }> };
}

const DOI_IN_TEXT = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;

/**
 * Splits a Google Scholar byline ("A Smith, B Jones - The Lancet, 2021 - thelancet.com")
 * into authors, venue and year.
 */
export function parseScholarSummary(summary: string): { authors: string; journal: string; year: string } {
  const parts = decodeHtmlEntities(summary || "").split(/\s+-\s+/);
  const authors = (parts[0] || "").replace(/…|\.\.\./g, "").trim();
  const venuePart = parts.length > 2 ? parts[1] : (parts[1] || "");
  const yearMatch = /\b(19|20)\d{2}\b/.exec(venuePart) || /\b(19|20)\d{2}\b/.exec(summary || "");
  const journal = venuePart.replace(/,?\s*\b(19|20)\d{2}\b/, "").replace(/…|\.\.\./g, "").trim();
  return { authors, journal, year: yearMatch ? yearMatch[0] : "" };
}

/**
 * Fetches results from Google Scholar. Google offers no Scholar API and blocks direct
 * scraping, so this uses SerpApi's google_scholar engine. Requires SERPAPI_API_KEY;
 * without it the source returns nothing and the other sources carry the search.
 */
export async function fetchGoogleScholarArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  const key = serpApiKey();
  if (!sanitized || !key) return [];

  const num = Math.min(Math.max(maxResults + 4, 8), 20);
  const url = `https://serpapi.com/search.json?engine=google_scholar&q=${encodeURIComponent(sanitized)}&num=${num}&hl=en&api_key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`Google Scholar (SerpApi) HTTP ${res.status}`);

    const data = await res.json();
    const hits = (data?.organic_results || []) as SerpScholarItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of hits) {
      const rawTitle = decodeHtmlEntities(item.title || "").replace(/^\[(?:PDF|HTML|CITATION|BOOK)\]\s*/i, "");
      if (!rawTitle || /protocol|trial registration/i.test(rawTitle)) continue;

      const link = typeof item.link === "string" && /^https?:\/\//i.test(item.link) ? item.link : "";
      const doiMatch = DOI_IN_TEXT.exec(link);
      const doi = doiMatch ? normalizeDoi(decodeURIComponent(doiMatch[1])) : "";
      const id = item.result_id || "";
      if (!doi && !id && !link) continue;

      const { authors, journal, year } = parseScholarSummary(item.publication_info?.summary || "");
      const namedAuthors = (item.publication_info?.authors || []).map(a => (a.name || "").trim()).filter(Boolean);
      const context = decodeHtmlEntities(item.snippet || "");
      const pubType = "Journal Article";
      const studyType = classifyPaperType({ title: rawTitle, pubType, publicationTypes: [pubType], context });

      articles.push({
        pmid: doi ? `doi:${doi}` : `gs:${id || link}`,
        title: rawTitle,
        authors: (namedAuthors.length ? namedAuthors.slice(0, 4).join(", ") : authors) || "Scholarly Authors",
        year,
        journal: journal || "Google Scholar Indexed Work",
        doi: doi || undefined,
        url: doi ? `https://doi.org/${doi}` : (link || `https://scholar.google.com/scholar?cluster=${encodeURIComponent(id)}`),
        source: "googlescholar",
        pubType,
        publicationTypes: [pubType],
        context: context || undefined,
        studyType
      });

      if (articles.length >= maxResults) break;
    }
    return articles;
  } catch (err) {
    console.warn("[Google Scholar] search error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Identity keys for a paper. Two records describe the same paper when ANY key matches, so a
 * paper retrieved from several providers (PubMed id, DOI, or just a matching title) collapses
 * to a single entry.
 */
export function articleIdentityKeys(art: { pmid?: string; doi?: string; title?: string }): string[] {
  const keys: string[] = [];
  const doi = normalizeDoi(art.doi || "");
  if (doi) keys.push(`doi:${doi}`);
  const pmid = String(art.pmid || "").trim();
  if (/^\d+$/.test(pmid)) keys.push(`pmid:${pmid}`);
  else if (/^doi:/i.test(pmid)) {
    const d = normalizeDoi(pmid.slice(4));
    if (d) keys.push(`doi:${d}`);
  } else if (pmid) keys.push(`id:${pmid.toLowerCase()}`);
  const cleanTitle = String(art.title || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
  if (cleanTitle.length > 15) keys.push(`t:${cleanTitle}`);
  return Array.from(new Set(keys));
}

/**
 * Deduplicates articles across different providers based on DOI, numerical PMID, or normalized title.
 */
export function deduplicateArticles(articles: LiteratureArticle[], alreadyUsed?: Set<string>): LiteratureArticle[] {
  const seenKeys = alreadyUsed ?? new Set<string>();
  const output: LiteratureArticle[] = [];

  for (const art of articles) {
    if (!art.title || !art.title.trim()) continue;
    const keys = articleIdentityKeys(art);
    if (keys.length > 0 && keys.some(k => seenKeys.has(k))) continue;
    keys.forEach(k => seenKeys.add(k));
    output.push(art);
  }

  return output;
}

export interface MultiSourceSearchOptions {
  /** Ignored: every source is mandatory. Kept so older callers still compile. */
  sources?: LiteratureSource[];
  query: string;
  maxResults?: number;
  questionType?: string;
  /**
   * Identity keys (see articleIdentityKeys) of papers already shown elsewhere. Matching papers
   * are skipped and the keys of returned papers are added, so a caller can pass one set across
   * several searches and no paper is ever repeated.
   */
  excludeKeys?: Set<string>;
}

/** Runs one source's fetcher. */
export function fetchFromSource(src: LiteratureSource, query: string, limit: number, questionType?: string): Promise<LiteratureArticle[]> {
  switch (src) {
    case "pubmed": return fetchPubMedArticles(query, limit, questionType);
    case "pmc": return fetchPmcArticles(query, limit, questionType);
    case "europepmc": return fetchEuropePmcArticles(query, limit, questionType);
    case "googlescholar": return fetchGoogleScholarArticles(query, limit);
    case "semanticscholar": return fetchSemanticScholarArticles(query, limit);
    case "openalex": return fetchOpenAlexArticles(query, limit);
    case "crossref": return fetchCrossrefArticles(query, limit);
    case "doaj": return fetchDoajArticles(query, limit);
    default: return Promise.resolve([]);
  }
}

/**
 * Concurrently queries EVERY literature source, providing error isolation,
 * cross-provider deduplication, and balanced representation.
 */
export async function searchMultiSourceLiterature(options: MultiSourceSearchOptions): Promise<LiteratureArticle[]> {
  const { query, maxResults = 10, questionType, excludeKeys } = options;
  const activeSources = resolveMandatorySources();
  if (!query.trim()) return [];

  const perSourceLimit = Math.max(Math.ceil(maxResults / activeSources.length) + 2, 4);
  const results = await Promise.allSettled(
    activeSources.map(src =>
      fetchFromSource(src, query, perSourceLimit, questionType).catch(() => [] as LiteratureArticle[])
    )
  );

  const buckets = activeSources.map((_, i) => {
    const r = results[i];
    return r.status === "fulfilled" ? r.value : [];
  });

  // Interleave results to guarantee representation across all sources
  const interleaved: LiteratureArticle[] = [];
  const maxBucketLen = Math.max(0, ...buckets.map(b => b.length));
  for (let i = 0; i < maxBucketLen; i++) {
    for (const b of buckets) {
      if (b[i]) interleaved.push(b[i]);
    }
  }

  // Dedupe against a scratch copy first so papers trimmed by the slice are not marked as used.
  const fresh = deduplicateArticles(interleaved, excludeKeys ? new Set(excludeKeys) : undefined).slice(0, maxResults);
  if (excludeKeys) {
    for (const art of fresh) articleIdentityKeys(art).forEach(k => excludeKeys.add(k));
  }
  return fresh;
}

/** Display badge (label, icon, CSS class) for the provider that returned a record. */
export function getSourceBadge(source?: string, pmid?: string): { label: string; icon: string; className: string } {
  const s = (source || "").toLowerCase();
  const id = pmid || "";
  const pick = (sid: LiteratureSource) => {
    const opt = SEARCH_SOURCE_OPTIONS.find(o => o.id === sid)!;
    return { label: opt.id === "crossref" ? "CrossRef" : opt.id === "pmc" ? "PMC" : opt.name, icon: opt.icon, className: opt.badgeClass };
  };
  if (SEARCH_SOURCE_OPTIONS.some(o => o.id === s)) return pick(s as LiteratureSource);
  if (id.startsWith("oax:")) return pick("openalex");
  if (id.startsWith("cr:")) return pick("crossref");
  if (id.startsWith("s2:")) return pick("semanticscholar");
  if (id.startsWith("gs:")) return pick("googlescholar");
  if (id.startsWith("doaj:")) return pick("doaj");
  if (id.startsWith("epmc:")) return pick("europepmc");
  if (/^(pmc:|PMC)/.test(id)) return pick("pmc");
  return pick("pubmed");
}

/** "PubMed · PMC · Europe PMC · …" - every mandatory source, for labels and exports. */
export const ALL_SOURCES_LABEL = SEARCH_SOURCE_OPTIONS.map(o => o.name.replace(/ \(PubMed Central\)$/, "")).join(" · ");
