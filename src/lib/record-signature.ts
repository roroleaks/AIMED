import crypto from "node:crypto";
import type { ExploreRecord } from "./explore-scoring.ts";

const HMAC_SECRET = process.env.AIMED_RECORD_SECRET || "aimed-internal-audit-hmac-secret-2026";

/**
 * Computes deterministic HMAC signature for an ExploreRecord to establish
 * server-side trust boundary between explore, compose, and export stages.
 */
export function computeRecordSignature(rec: Partial<ExploreRecord>): string {
  const payload = [
    String(rec.pmid || "").trim(),
    String(rec.doi || "").trim().toLowerCase(),
    String(rec.title || "").trim().toLowerCase(),
    String(rec.year || "").trim()
  ].join("|");

  return crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");
}

export function signRecord<T extends Partial<ExploreRecord>>(rec: T): T & { _sig: string } {
  return {
    ...rec,
    _sig: computeRecordSignature(rec)
  };
}

export function verifyRecordSignature(rec: Partial<ExploreRecord> & { _sig?: string }): boolean {
  if (!rec._sig || typeof rec._sig !== "string") return false;
  const expected = computeRecordSignature(rec);
  try {
    return crypto.timingSafeEqual(Buffer.from(rec._sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
