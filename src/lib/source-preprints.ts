/**
 * Preprints Source Fetcher (Europe PMC PPR Slice)
 *
 * Retrieves non-peer-reviewed early life-science and clinical preprints
 * indexed in Europe PMC (including medRxiv, bioRxiv, Research Square, Preprints.org, etc.).
 *
 * CRITICAL INTEGRITY REQUIREMENT:
 * Preprints are NOT peer-reviewed evidence and are deterministically excluded
 * from direct citation support. They surface in the retrieved / contextual lists
 * with distinct badges to provide visibility into early active research without compromising
 * publication-grade citation backing.
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

const API_TIMEOUT_MS = 7_500;
const USER_AGENT = "aimed/4.1 (https://aimed-pico.vercel.app; mailto:raouf.roshdy@gmail.com)";

interface EuropePmcPreprintItem {
  id?: string;
  source?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string | number;
  abstractText?: string;
}

export async function fetchPreprintArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const pageSize = Math.min(Math.max(maxResults + 4, 8), 25);
  const q = `${sanitized} AND (SRC:PPR)`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&pageSize=${pageSize}&format=json&resultType=core&sort=RELEVANCE`;

  try {
    await rateSlot("ebi", 120);
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });

    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) {
        noteSourceFailure("preprints", new Error(`Europe PMC Preprints HTTP ${res.status}`));
      }
      throw new Error(`Europe PMC Preprints HTTP ${res.status}`);
    }

    const data = await res.json();
    const hits = (data?.resultList?.result || []) as EuropePmcPreprintItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of hits) {
      const rawTitle = decodeHtmlEntities(item.title || "");
      if (!rawTitle || isNonEvidenceTitle(rawTitle)) continue;

      const doi = normalizeDoi(item.doi || "");
      const pmid = doi ? `doi:${doi}` : `ppr:${item.id || ""}`;
      if (!pmid) continue;

      const context = decodeHtmlEntities(item.abstractText || "");
      const articleUrl = doi
        ? `https://doi.org/${doi}`
        : `https://europepmc.org/article/PPR/${item.id || ""}`;

      articles.push({
        pmid,
        title: rawTitle,
        authors: decodeHtmlEntities(item.authorString || "Preprint Contributors").slice(0, 120),
        year: item.pubYear ? String(item.pubYear) : "",
        journal: decodeHtmlEntities(item.journalTitle || "Europe PMC Preprints (medRxiv/bioRxiv)"),
        doi: doi || undefined,
        url: articleUrl,
        source: "preprints",
        pubType: "Preprint",
        publicationTypes: ["Preprint"],
        studyType: "Preprint",
        context: context || undefined
      });
    }

    return articles;
  } catch (err) {
    noteSourceFailure("preprints", err);
    return [];
  }
}
