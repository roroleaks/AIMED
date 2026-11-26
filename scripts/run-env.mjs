import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const sep = args.indexOf("--");
if (sep === -1 || sep === args.length - 1) {
  console.error("Usage: node scripts/run-env.mjs KEY=VAL [KEY2=VAL2] -- <cmd> [args...]");
  process.exit(1);
}

const envPairs = args.slice(0, sep);
const cmdArgs = args.slice(sep + 1);

const env = { ...process.env };
for (const pair of envPairs) {
  const eq = pair.indexOf("=");
  if (eq > 0) {
    env[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
}

const [cmd, ...rest] = cmdArgs;
const result = spawnSync(cmd, rest, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
