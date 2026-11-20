/**
 * ClinicalTrials.gov Source Fetcher (API v2)
 *
 * NIH ClinicalTrials.gov v2 REST API (free, open, no API key required).
 * Provides access to 450,000+ registered clinical trials and protocols worldwide.
 *
 * NOTE: Registered trials are NOT peer-reviewed evidence of clinical effect;
 * they represent registered research protocols, ongoing investigations, and trial registry metadata.
 * They are utilized for evidence gap mapping and ongoing trial identification,
 * and are deterministically excluded from direct commentary citation support.
 */

import {
  type LiteratureArticle,
  sanitizeSearchQuery,
  decodeHtmlEntities,
  rateSlot,
  noteSourceFailure,
  isNonEvidenceTitle
} from "./literature-sources.ts";

const API_TIMEOUT_MS = 4_000;
const USER_AGENT = "aimed/4.1 (https://aimed-pico.vercel.app; mailto:raouf.roshdy@gmail.com)";

interface ClinicalTrialsStudyItem {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
    };
    statusModule?: {
      overallStatus?: string;
      startDateStruct?: {
        date?: string;
      };
      startDate?: string;
    };
    conditionsModule?: {
      conditions?: string[];
    };
    designModule?: {
      studyType?: string;
    };
    armsInterventionsModule?: {
      interventions?: Array<{ name?: string }>;
    };
    descriptionModule?: {
      briefSummary?: string;
    };
  };
}

export async function fetchClinicalTrialsArticles(query: string, maxResults = 6): Promise<LiteratureArticle[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return [];

  const pageSize = Math.min(Math.max(maxResults + 4, 8), 25);
  const fields = "NCTId|BriefTitle|OfficialTitle|OverallStatus|StudyType|Condition|InterventionName|StartDate|BriefSummary";
  const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(sanitized)}&pageSize=${pageSize}&fields=${encodeURIComponent(fields)}`;

  try {
    await rateSlot("clinicaltrials", 250);
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });

    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) {
        noteSourceFailure("clinicaltrials", new Error(`ClinicalTrials HTTP ${res.status}`));
      }
      throw new Error(`ClinicalTrials.gov HTTP ${res.status}`);
    }

    const data = await res.json();
    const studies = (data?.studies || []) as ClinicalTrialsStudyItem[];
    const articles: LiteratureArticle[] = [];

    for (const item of studies) {
      const proto = item.protocolSection;
      const nctId = proto?.identificationModule?.nctId?.trim();
      if (!nctId) continue;

      const rawTitle = decodeHtmlEntities(proto?.identificationModule?.briefTitle || proto?.identificationModule?.officialTitle || "");
      if (!rawTitle || isNonEvidenceTitle(rawTitle)) continue;

      const startDate = proto?.statusModule?.startDateStruct?.date || proto?.statusModule?.startDate || "";
      const year = startDate.slice(0, 4);

      const status = proto?.statusModule?.overallStatus || "REGISTERED";
      const conditions = (proto?.conditionsModule?.conditions || []).slice(0, 3).join(", ");
      const interventions = (proto?.armsInterventionsModule?.interventions || [])
        .map(i => i.name)
        .filter(Boolean)
        .slice(0, 3)
        .join("; ");
      const summary = proto?.descriptionModule?.briefSummary || "";

      const contextParts: string[] = [];
      if (status) contextParts.push(`Status: ${status}`);
      if (conditions) contextParts.push(`Conditions: ${conditions}`);
      if (interventions) contextParts.push(`Interventions: ${interventions}`);
      if (summary) contextParts.push(summary.slice(0, 300));

      articles.push({
        pmid: `nct:${nctId.toLowerCase()}`,
        title: rawTitle,
        authors: "ClinicalTrials.gov Registry",
        year,
        journal: "ClinicalTrials.gov Registry",
        url: `https://clinicaltrials.gov/study/${nctId}`,
        source: "clinicaltrials",
        pubType: "Trial Registration",
        publicationTypes: ["Trial Registration"],
        studyType: "Clinical Trial (Registered)",
        context: decodeHtmlEntities(contextParts.join(" | "))
      });
    }

    return articles;
  } catch (err) {
    noteSourceFailure("clinicaltrials", err);
    return [];
  }
}
