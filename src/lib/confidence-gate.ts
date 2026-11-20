import { checkCitations, type AuditableRef, type PicoElement } from "./relevance.ts";

/**
 * Confidence thresholds and fallback triggers for the hybrid LLM/deterministic pipeline.
 * 
 * This module centralizes the logic for deciding when the AI-generated output is
 * trustworthy enough to publish, and when the system should gracefully fall back
 * to the deterministic rule-based path. All thresholds are conservative and tuned
 * for clinical safety - preferring a high-quality evidence list over a risky
 * synthesized narrative.
 */

export interface ConfidenceGateResult {
  /** Whether the AI output passed all confidence gates */
  passed: boolean;
  /** Overall confidence score (0-100) */
  score: number;
  /** Individual gate results for telemetry */
  gates: GateResult[];
  /** Reason for fallback if any gate failed */
  fallbackReason?: string;
  /** Telemetry data for monitoring LLM vs deterministic usage */
  telemetry: TelemetryData;
}

export interface GateResult {
  name: string;
  passed: boolean;
  score: number;
  threshold: number;
  details?: string;
}

export interface TelemetryData {
  /** Which path was ultimately used: "llm" or "deterministic" */
  pathUsed: "llm" | "deterministic";
  /** Whether a fallback was triggered during this request */
  fallbackTriggered: boolean;
  /** Number of gates that failed */
  failedGates: number;
  /** Total processing time in milliseconds */
  processingTimeMs?: number;
  /** Whether the LLM was available at request time */
  llmAvailable: boolean;
}

/** Configuration for confidence gates - can be tuned per environment */
export interface ConfidenceGateConfig {
  /** Minimum overall confidence score to trust LLM output (0-100) */
  minOverallScore: number;
  /** Minimum citation coverage ratio (cited refs / total refs) */
  minCitationCoverage: number;
  /** Maximum allowed orphan citations (citations without matching reference) */
  maxOrphanCitations: number;
  /** Maximum allowed uncited references */
  maxUncitedReferences: number;
  /** Minimum required PICO coverage in evidence set (fraction of PICO elements addressed) */
  minPicoCoverage: number;
  /** Maximum allowed hallucination risk score (from claim finalization) */
  maxHallucinationRisk: number;
  /** Minimum metadata completeness in evidence set (fraction of records with DOI/PMID) */
  minMetadataCompleteness: number;
  /** Whether LLM provider key is configured */
  llmAvailable: boolean;
}

/** Default production configuration - conservative for clinical safety */
export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceGateConfig = {
  minOverallScore: 75,
  minCitationCoverage: 0.85,
  maxOrphanCitations: 0,
  maxUncitedReferences: 0,
  minPicoCoverage: 0.75,
  maxHallucinationRisk: 10,
  minMetadataCompleteness: 0.8,
  llmAvailable: true,
};

/** Relaxed configuration for development/testing */
export const RELAXED_CONFIDENCE_CONFIG: ConfidenceGateConfig = {
  minOverallScore: 50,
  minCitationCoverage: 0.6,
  maxOrphanCitations: 2,
  maxUncitedReferences: 2,
  minPicoCoverage: 0.5,
  maxHallucinationRisk: 25,
  minMetadataCompleteness: 0.5,
  llmAvailable: true,
};

/**
 * Evaluate LLM-generated commentary against all confidence gates.
 * 
 * @param commentary The LLM-generated commentary object
 * @param evidenceSet The evidence set used for generation
 * @param elements PICO elements used for generation
 * @param config Optional custom configuration (defaults to production)
 * @returns ConfidenceGateResult with pass/fail and telemetry
 */
export function evaluateConfidence(
  commentary: Record<string, unknown>,
  evidenceSet: { retainedRecords: AuditableRef[]; allowedCitationKeys: Set<string>; citationMap: Map<string, unknown>; retrievedCount: number; retainedCount: number; excludedCount: number },
  elements: PicoElement[],
  config: ConfidenceGateConfig = DEFAULT_CONFIDENCE_CONFIG,
  startTime?: number,
  options?: { claimWarnings?: string[]; totalClaims?: number; unsupportedClaims?: number }
): ConfidenceGateResult {
  const start = typeof startTime === "number" ? startTime : Date.now();
  const gates: GateResult[] = [];

  // Gate 1: Citation Integrity
  const discussion = String(commentary.discussion || "");
  const references = (commentary.references || []) as string[];
  const citationChecks = checkCitations(discussion, references);
  
  const citationCoverage = references.length > 0 ? citationChecks.citedRefs / references.length : 0;
  gates.push({
    name: "citation_integrity",
    passed: citationChecks.orphans.length <= config.maxOrphanCitations &&
            citationChecks.uncited.length <= config.maxUncitedReferences &&
            citationCoverage >= config.minCitationCoverage,
    score: Math.round(citationCoverage * 100),
    threshold: Math.round(config.minCitationCoverage * 100),
    details: `orphans=${citationChecks.orphans.length}, uncited=${citationChecks.uncited.length}, coverage=${Math.round(citationCoverage * 100)}%`
  });

  // Gate 2: PICO Coverage in Evidence
  const picoElements = elements.filter(e => e.value && e.value.trim().length > 0);
  const picoCoverage = evidenceSet.retainedCount > 0 
    ? Math.min(1, evidenceSet.retainedCount / Math.max(1, picoElements.length))
    : 0;
  gates.push({
    name: "pico_coverage",
    passed: picoCoverage >= config.minPicoCoverage,
    score: Math.round(picoCoverage * 100),
    threshold: Math.round(config.minPicoCoverage * 100),
    details: `retained=${evidenceSet.retainedCount}, elements=${picoElements.length}`
  });

  // Gate 3: Metadata Completeness (records with DOI/PMID and abstract)
  const retainedList = evidenceSet.retainedRecords || [];
  const totalRecords = retainedList.length || evidenceSet.retainedCount;
  const doiPmidCount = retainedList.filter(r => !!(r.doi && String(r.doi).trim()) || !!(r.pmid && /^\d+$/.test(String(r.pmid)))).length;
  const abstractCount = retainedList.filter(r => (r.context || "").length > 30).length;
  const doiPmidRatio = totalRecords > 0 ? doiPmidCount / totalRecords : 0;
  const abstractRatio = totalRecords > 0 ? abstractCount / totalRecords : 0;
  const metadataPassed = totalRecords > 0 && doiPmidRatio >= 0.6 && abstractRatio >= 0.6;
  const metadataScore = Math.round(((doiPmidRatio + abstractRatio) / 2) * 100);

  gates.push({
    name: "metadata_completeness",
    passed: metadataPassed,
    score: metadataScore,
    threshold: 60,
    details: `doi_pmid=${Math.round(doiPmidRatio * 100)}%, abstract=${Math.round(abstractRatio * 100)}%`
  });

  // Gate 4: Hallucination Risk (from claim finalization warnings)
  const totalClaims = options?.totalClaims ?? 10;
  const unsupportedCount = options?.unsupportedClaims ?? (options?.claimWarnings ? options.claimWarnings.length : 0);
  const hallucinationRatio = totalClaims > 0 ? unsupportedCount / totalClaims : 0;
  const hallucinationRiskScore = Math.round(hallucinationRatio * 100);
  const hallucinationPassed = hallucinationRiskScore <= 25;
  gates.push({
    name: "hallucination_risk",
    passed: hallucinationPassed,
    score: Math.max(0, 100 - hallucinationRiskScore),
    threshold: 75,
    details: `unsupported=${unsupportedCount}, total=${totalClaims}, risk=${hallucinationRiskScore}%`
  });

  // Gate 5: Evidence Retrieval Precision
  const retrievalPrecision = evidenceSet.retrievedCount > 0 
    ? evidenceSet.retainedCount / evidenceSet.retrievedCount
    : 0;
  gates.push({
    name: "retrieval_quality",
    passed: retrievalPrecision >= 0.05,
    score: Math.min(100, Math.round(retrievalPrecision * 200)),
    threshold: 5,
    details: `retrieved=${evidenceSet.retrievedCount}, retained=${evidenceSet.retainedCount}, precision=${Math.round(retrievalPrecision * 100)}%`
  });

  // Gate 6: LLM Availability
  gates.push({
    name: "llm_availability",
    passed: config.llmAvailable,
    score: config.llmAvailable ? 100 : 0,
    threshold: 100,
    details: config.llmAvailable ? "available" : "unavailable"
  });

  // Overall score is average of gate scores
  const gateScores = gates.map(g => g.score);
  const overallScore = gateScores.reduce((a, b) => a + b, 0) / gateScores.length;

  const failedGates = gates.filter(g => !g.passed);
  const passed = failedGates.length === 0;
  const fallbackReason = failedGates.length > 0 
    ? failedGates.map(g => `${g.name}: ${g.details}`).join("; ")
    : undefined;

  const elapsed = Math.max(0, Date.now() - start);

  const telemetry: TelemetryData = {
    pathUsed: passed ? "llm" : "deterministic",
    fallbackTriggered: !passed,
    failedGates: failedGates.length,
    processingTimeMs: elapsed,
    llmAvailable: config.llmAvailable
  };

  return {
    passed,
    score: Math.round(overallScore),
    gates,
    fallbackReason,
    telemetry
  };
}

/**
 * Determine if deterministic fallback should be used based on confidence gate results.
 * 
 * @param result The confidence gate evaluation result
 * @returns true if deterministic fallback should be used
 */
export function shouldUseDeterministicFallback(
  result: ConfidenceGateResult,
  config: ConfidenceGateConfig = DEFAULT_CONFIDENCE_CONFIG
): boolean {
  return !result.passed || result.telemetry.failedGates > 0 || result.score < config.minOverallScore || !result.telemetry.llmAvailable;
}

/**
 * Create a telemetry event for logging LLM vs deterministic path usage.
 * 
 * @param telemetry The telemetry data from confidence evaluation
 * @param context Additional context (user session, request ID, etc.)
 * @returns Structured log entry
 */
export function createTelemetryEvent(
  telemetry: TelemetryData,
  context: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    event: "confidence_gate_evaluation",
    path_used: telemetry.pathUsed,
    fallback_triggered: telemetry.fallbackTriggered,
    failed_gates: telemetry.failedGates,
    llm_available: telemetry.llmAvailable,
    ...context
  };
}


