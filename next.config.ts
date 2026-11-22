import type { NextConfig } from "next";
import { execSync } from "node:child_process";

let commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_COMMIT_SHA || "";
if (!commitSha) {
  try {
    commitSha = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    commitSha = "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha
  }
};

export default nextConfig;
