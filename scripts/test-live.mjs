import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('🌐 Running AIMed test suite with live network queries enabled (AIMED_LIVE_NETWORK=1)...');

const testFiles = fs.readdirSync('src/lib')
  .filter(f => f.endsWith('.test.ts'))
  .map(f => path.join('src/lib', f));

const env = { ...process.env, AIMED_LIVE_NETWORK: '1' };
const res = spawnSync('node', ['--test', ...testFiles], {
  stdio: 'inherit',
  env
});

process.exit(res.status ?? 1);
