import crypto from "node:crypto";
import type { ExploreRecord } from "./explore-scoring.ts";

// Ephemeral in-memory key generated once per server/runtime process if not configured via environment.
// Never uses a static committed string, preventing forgery from public source inspection.
const RUNTIME_KEY = crypto.randomBytes(32).toString("hex");

function getSecret(): string {
  return process.env.AIMED_RECORD_SECRET || RUNTIME_KEY;
}

/**
 * Computes deterministic HMAC signature for an ExploreRecord to establish
 * server-side trust boundary between explore, compose, and export stages.
 * Covers all substantive fields: IDs, title, authors, year, journal, abstract/context, score, and PICO matches.
 */
export function computeRecordSignature(rec: Partial<ExploreRecord>): string {
  const payload = JSON.stringify({
    pmid: String(rec.pmid || "").trim(),
    doi: String(rec.doi || "").trim().toLowerCase(),
    title: String(rec.title || "").trim().toLowerCase(),
    authors: String(rec.authors || "").trim(),
    year: String(rec.year || "").trim(),
    journal: String(rec.journal || "").trim().toLowerCase(),
    context: String(rec.context || "").trim().slice(0, 500),
    relevancePct: typeof rec.relevancePct === "number" ? rec.relevancePct : 0,
    matchedElements: Array.isArray(rec.matchedElements) ? [...rec.matchedElements].sort() : []
  });

  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function signRecord<T extends Partial<ExploreRecord>>(rec: T): T & { _sig: string } {
  return {
    ...rec,
    _sig: computeRecordSignature(rec)
  };
}

export function verifyRecordSignature(rec: Partial<ExploreRecord> & { _sig?: string }): boolean {
  if (!rec || !rec._sig || typeof rec._sig !== "string") return false;
  const expected = computeRecordSignature(rec);
  try {
    return crypto.timingSafeEqual(Buffer.from(rec._sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
