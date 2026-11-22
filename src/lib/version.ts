/**
 * Version and build metadata for AIMED.
 * Injects commit SHA from environment variables at build or runtime.
 */

export const APP_VERSION = "4.2.0";

export function getCommitSha(): string {
  const envSha =
    process.env.NEXT_PUBLIC_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    "";
  if (envSha) return envSha.slice(0, 7);
  return "4.2.0";
}

export function getFooterText(): string {
  return `Generated with AIMED v${APP_VERSION} (${getCommitSha()}) — draft`;
}

export const DRAFT_DISCLAIMER =
  "Automated draft. Retrieval is not a systematic search; risk of bias and certainty were not assessed; verify every citation and claim before use.";
