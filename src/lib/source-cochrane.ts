/**
 * Cochrane Source Fetcher (Two-tier CENTRAL / CDSR)
 *
 * Tier 1: Best-effort query to Cochrane Library site search endpoint.
 * Tier 2: Reliable fallback query to Cochrane Database of Systematic Reviews (CDSR)
 *         and CENTRAL indexed records through Europe PMC REST API.
 */

import {
  type LiteratureArticle,
  sanitizeSearchQuery,
  decodeHtmlEntities,
  rateSlot,
  noteSourceFailure,
  isNonEvidenceTitle
} from "./literature-sources.ts";
import { normalizeDoi } from "./evidence-set.ts";
import { classifyPaperType } from "./study-design.ts";

const API_TIMEOUT_MS = 7_500;
const USER_AGENT = "aimed/4.1 (https://aimed-pico.vercel.app; mailto:raouf.roshdy@gmail.com)";

interface EuropePmcCochraneItem {
  id?: string;
  source?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  journalInfo?: { journal?: { title?: string } };
  pubYear?: string | number;
  abstractText?: string;
  pubTypeList?: { pubType?: string | string[] };
}

async function fetchFromEuropePmcCochrane(query: string, maxResults: number): Promise<LiteratureArticle[]> {
  const pageSize = Math.min(Math.max(maxResults + 4, 8), 25);
  const q = `${query} cochrane`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&pageSize=${pageSize}&format=json&resultType=core&sort=RELEVANCE`;

  await rateSlot("ebi", 120);
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(API_TIMEOUT_MS)
  });

  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      noteSourceFailure("cochrane", new Error(`Europe PMC Cochrane HTTP ${res.status}`));
    }
    throw new Error(`Europe PMC Cochrane HTTP ${res.status}`);
  }

  const data = await res.json();
  const hits = (data?.resultList?.result || []) as EuropePmcCochraneItem[];
  const articles: LiteratureArticle[] = [];

  for (const item of hits) {
    const rawTitle = decodeHtmlEntities(item.title || "");
    if (!rawTitle || isNonEvidenceTitle(rawTitle)) continue;

    const doi = normalizeDoi(item.doi || "");
    const pmidNum = item.pmid ? String(item.pmid).replace(/\D/g, "") : "";
    const pmid = pmidNum || (doi ? `doi:${doi}` : `cochrane:${item.id || ""}`);
    if (!pmid) continue;

    const context = decodeHtmlEntities(item.abstractText || "");
    const pubTypes = ["Systematic Review", "Meta-Analysis"];
    const studyType = classifyPaperType({
      title: rawTitle,
      pubType: "Systematic Review",
      publicationTypes: pubTypes,
      context
    });

    const articleUrl = doi
      ? `https://doi.org/${doi}`
      : pmidNum
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmidNum}/`
        : `https://www.cochranelibrary.com/cdsr/doi/${item.id || ""}/full`;

    articles.push({
      pmid,
      title: rawTitle,
      authors: decodeHtmlEntities(item.authorString || "Cochrane Systematic Reviewers").slice(0, 120),
      year: item.pubYear ? String(item.pubYear) : "",
      journal: "Cochrane Database of Systematic Reviews",
      doi: doi || undefined,
      url: articleUrl,
      source: "cochrane",
      pubType: "Systematic Review",
      publicationTypes: pubTypes,
      studyType,
      context: context || undefined
    });
  }

  return articles;
}

export async function fetchCochraneArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  // Tier 1: Best-effort direct search on Cochrane Library public endpoint
  try {
    await rateSlot("cochrane", 300);
    const directUrl = `https://www.cochranelibrary.com/cdsr/do/search/api?searchText=${encodeURIComponent(sanitized)}&pageSize=${maxResults}`;
    const directRes = await fetch(directUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      signal: AbortSignal.timeout(2_500)
    });

    if (directRes.ok) {
      const data = await directRes.json().catch(() => null);
      const items = (data?.results || data?.records || []) as Array<{ title?: string; doi?: string; authors?: string; pubDate?: string }>;
      if (Array.isArray(items) && items.length > 0) {
        const directArticles: LiteratureArticle[] = [];
        for (const it of items) {
          const title = decodeHtmlEntities(it.title || "");
          if (!title || isNonEvidenceTitle(title)) continue;
          const doi = normalizeDoi(it.doi || "");
          directArticles.push({
            pmid: doi ? `doi:${doi}` : `cochrane:${title.slice(0, 30)}`,
            title,
            authors: decodeHtmlEntities(it.authors || "Cochrane Authors").slice(0, 120),
            year: (it.pubDate || "").slice(0, 4),
            journal: "Cochrane Database of Systematic Reviews",
            doi: doi || undefined,
            url: doi ? `https://doi.org/${doi}` : "https://www.cochranelibrary.com/",
            source: "cochrane",
            pubType: "Systematic Review",
            publicationTypes: ["Systematic Review"],
            studyType: "Systematic Review and Meta-Analysis"
          });
        }
        if (directArticles.length > 0) return directArticles;
      }
    }
  } catch {
    // Failover silently to Tier 2 (Europe PMC CDSR slice)
  }

  // Tier 2: Europe PMC REST CDSR slice
  try {
    return await fetchFromEuropePmcCochrane(sanitized, maxResults);
  } catch (err) {
    noteSourceFailure("cochrane", err);
    return [];
  }
}
