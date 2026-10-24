import type { AuditableRef } from "./relevance.ts";

export type CitationStyle = "vancouver" | "apa" | "harvard";

export interface CitationStyleOption {
  id: CitationStyle;
  name: string;
  badge: string;
  shortDescription: string;
  inTextExample: string;
  bibExample: string;
}

export const CITATION_STYLE_OPTIONS: CitationStyleOption[] = [
  {
    id: "vancouver",
    name: "Vancouver (No Brackets)",
    badge: "ICMJE / NLM",
    shortDescription: "Standard biomedical style. In-text citations are numbers without brackets; reference list is numbered.",
    inTextExample: "1 or 1, 2 or 1-3",
    bibExample: "1. Smith JA, Brown K. Title of article. Journal Name. 2023; doi:10.xxxx"
  },
  {
    id: "apa",
    name: "APA 7th Edition",
    badge: "APA 7th",
    shortDescription: "Author-date format. In-text citations include (Author, Year); references formatted with (Year) and DOI.",
    inTextExample: "(Smith & Brown, 2023) or (Smith et al., 2023)",
    bibExample: "Smith, J. A., & Brown, K. (2023). Title of article. Journal Name. https://doi.org/10.xxxx"
  },
  {
    id: "harvard",
    name: "Harvard Style",
    badge: "Harvard",
    shortDescription: "Author-date format. In-text citations include (Author Year); references formatted with 'Title' and Year.",
    inTextExample: "(Smith and Brown 2023) or (Smith et al. 2023)",
    bibExample: "Smith, J.A. and Brown, K., 2023. 'Title of article'. Journal Name. doi:10.xxxx"
  }
];

export interface ParsedAuthor {
  surname: string;
  initials: string;
}

/**
 * Extracts author surnames and initials from various source formats.
 */
export function parseAuthorNames(authorStr?: string): ParsedAuthor[] {
  if (!authorStr || !authorStr.trim()) return [];
  // Split on commas, semicolons, or " and "
  const rawSegments = authorStr
    .split(/[,;]|\sand\s/i)
    .map(s => s.trim().replace(/\.$/, ""))
    .filter(Boolean);

  const authors: ParsedAuthor[] = [];

  for (const seg of rawSegments) {
    const tokens = seg.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    if (tokens.length === 1) {
      authors.push({ surname: tokens[0], initials: "" });
      continue;
    }

    const first = tokens[0];
    const last = tokens[tokens.length - 1];

    if (/^[A-Z]{1,3}$/.test(last)) {
      // e.g. "Smith JA"
      authors.push({
        surname: tokens.slice(0, tokens.length - 1).join(" "),
        initials: last.split("").join(".") + "."
      });
    } else if (/^[A-Z]{1,3}$/.test(first)) {
      // e.g. "JA Smith"
      authors.push({
        surname: tokens.slice(1).join(" "),
        initials: first.split("").join(".") + "."
      });
    } else {
      // e.g. "John Smith" or "John A. Smith"
      authors.push({
        surname: last,
        initials: first[0].toUpperCase() + "."
      });
    }
  }

  return authors.length ? authors : [{ surname: authorStr.trim(), initials: "" }];
}

/**
 * Formats authors according to Vancouver convention (NLM):
 * e.g. "Smith JA, Brown K, Taylor LM."
 */
export function formatVancouverAuthors(authorStr?: string): string {
  if (!authorStr || !authorStr.trim()) return "Authors";
  const parsed = parseAuthorNames(authorStr);
  if (!parsed.length) return authorStr.trim();
  const formatted = parsed.slice(0, 6).map(a => {
    const init = a.initials.replace(/\./g, "").trim();
    return init ? `${a.surname} ${init}` : a.surname;
  });
  if (parsed.length > 6) {
    formatted.push("et al");
  }
  return formatted.join(", ") + ".";
}

/**
 * Formats authors according to APA 7th Edition:
 * e.g. "Smith, J. A., & Brown, K." or "Smith, J. A., Brown, K., & Taylor, L. M."
 */
export function formatApaAuthors(authorStr?: string): string {
  if (!authorStr || !authorStr.trim()) return "Authors";
  const parsed = parseAuthorNames(authorStr);
  if (!parsed.length) return authorStr.trim();

  const formatted = parsed.slice(0, 20).map(a => {
    const inits = a.initials ? (a.initials.endsWith(".") ? a.initials : a.initials + ".") : "";
    return inits ? `${a.surname}, ${inits}` : a.surname;
  });

  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
  const last = formatted.pop();
  return `${formatted.join(", ")}, & ${last}`;
}

/**
 * Formats authors according to Harvard style:
 * e.g. "Smith, J.A. and Brown, K."
 */
export function formatHarvardAuthors(authorStr?: string): string {
  if (!authorStr || !authorStr.trim()) return "Authors";
  const parsed = parseAuthorNames(authorStr);
  if (!parsed.length) return authorStr.trim();

  const formatted = parsed.slice(0, 6).map(a => {
    const inits = a.initials ? a.initials.replace(/\s+/g, "") : "";
    return inits ? `${a.surname}, ${inits}` : a.surname;
  });

  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  if (parsed.length > 6) {
    return `${formatted[0]} et al.`;
  }
  const last = formatted.pop();
  return `${formatted.join(", ")} and ${last}`;
}

/**
 * Formats an in-text author-year citation tag for a single record.
 */
export function singleRecordInText(rec: AuditableRef, style: CitationStyle): string {
  const parsed = parseAuthorNames(rec.authors);
  const year = rec.year ? String(rec.year).trim() : "n.d.";
  const firstSurname = parsed[0]?.surname || "Anonymous";

  if (style === "apa") {
    if (parsed.length === 1) return `${firstSurname}, ${year}`;
    if (parsed.length === 2) return `${parsed[0].surname} & ${parsed[1].surname}, ${year}`;
    return `${firstSurname} et al., ${year}`;
  }

  if (style === "harvard") {
    if (parsed.length === 1) return `${firstSurname} ${year}`;
    if (parsed.length === 2) return `${parsed[0].surname} and ${parsed[1].surname} ${year}`;
    return `${firstSurname} et al. ${year}`;
  }

  return `${firstSurname} ${year}`;
}

/**
 * Formats a reference entry in the requested citation style.
 */
export function formatReferenceInStyle(
  ref: AuditableRef,
  style: CitationStyle = "vancouver",
  index?: number
): string {
  const url = ref.url || (ref.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/` : "");
  const rawTitle = (ref.title || "").trim().replace(/\.$/, "");
  const journal = (ref.journal || "").trim().replace(/\.$/, "");
  const year = ref.year ? String(ref.year).trim() : "";
  const doiNorm = ref.doi ? ref.doi.replace(/^doi:\s*/i, "").trim() : "";

  if (style === "apa") {
    const authors = formatApaAuthors(ref.authors);
    const yrPart = year ? `(${year}).` : "(n.d.).";
    const titlePart = rawTitle ? `${rawTitle}.` : "";
    const jPart = journal ? `${journal}.` : "";
    const doiPart = doiNorm ? `https://doi.org/${doiNorm}` : url;
    return [authors, yrPart, titlePart, jPart, doiPart].filter(Boolean).join(" ");
  }

  if (style === "harvard") {
    const rawAuthors = formatHarvardAuthors(ref.authors);
    const authors = rawAuthors ? (rawAuthors.endsWith(",") ? rawAuthors : `${rawAuthors},`) : "";
    const yrPart = year ? `${year}.` : "n.d.";
    const titlePart = rawTitle ? `'${rawTitle}'.` : "";
    const jPart = journal ? `${journal}.` : "";
    const doiPart = doiNorm ? `doi:${doiNorm}` : url;
    return [authors, yrPart, titlePart, jPart, doiPart].filter(Boolean).join(" ");
  }

  // Vancouver style (without brackets in the number): e.g. "1. Author AA. Title. Journal. Year; doi:..."
  const prefix = typeof index === "number" && index > 0 ? `${index}. ` : "";
  const authors = formatVancouverAuthors(ref.authors);
  const titlePart = rawTitle ? `${rawTitle}.` : "";
  const jPart = journal ? `${journal}.` : "";
  const yrPart = year ? `${year}.` : "";
  const doiPart = doiNorm ? `doi:${doiNorm}` : "";

  return `${prefix}${[authors, titlePart, jPart ? `${jPart} ${yrPart}`.trim() : yrPart, doiPart, url].filter(Boolean).join(" ")}`.trim();
}

/**
 * Converts bracketed citation tokens like [1], [1, 2], [1-3] in narrative text
 * into the target citation style:
 * - Vancouver: Numbers WITHOUT brackets, e.g. "1", "1, 2", "1-3"
 * - APA: Author-Date citations in parentheses, e.g. "(Smith et al., 2023)"
 * - Harvard: Author-Date citations in parentheses, e.g. "(Smith and Brown 2023)"
 */
export function convertNarrativeToStyle(
  narrative: string,
  style: CitationStyle,
  retained: AuditableRef[]
): string {
  if (!narrative) return "";

  const citeRegex = /\[([\d\s,\-]+)\]/g;

  return narrative.replace(citeRegex, (fullMatch, inner: string) => {
    const parts = inner.split(/\s*,\s*/);
    const nums: number[] = [];

    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        const n = parseInt(part, 10);
        if (n > 0) nums.push(n);
      } else if (/^(\d+)\s*-\s*(\d+)$/.test(part)) {
        const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (m) {
          const start = parseInt(m[1], 10);
          const end = parseInt(m[2], 10);
          for (let i = start; i <= end; i++) nums.push(i);
        }
      }
    }

    if (nums.length === 0) return fullMatch;

    if (style === "vancouver") {
      // NOTE: Vancouver without brackets!
      // Return plain unbracketed range/list e.g. "1", "1, 2", "1-3"
      if (nums.length === 1) return String(nums[0]);
      if (nums.length === 2) return `${nums[0]}, ${nums[1]}`;
      // Check if contiguous sequence
      const isContiguous = nums.every((val, idx) => idx === 0 || val === nums[idx - 1] + 1);
      if (isContiguous) {
        return `${nums[0]}-${nums[nums.length - 1]}`;
      }
      return nums.join(", ");
    }

    // For APA and Harvard: map each 1-based index to author-date
    const inTextItems: string[] = [];
    for (const num of nums) {
      const idx = num - 1;
      const rec = retained[idx];
      if (rec) {
        inTextItems.push(singleRecordInText(rec, style));
      } else {
        inTextItems.push(style === "apa" ? `Ref ${num}` : `Ref ${num}`);
      }
    }

    const unique = [...new Set(inTextItems)];
    if (unique.length === 0) return fullMatch;

    return `(${unique.join("; ")})`;
  });
}
