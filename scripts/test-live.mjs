import { spawnSync } from 'node:child_process';

console.log('🌐 Running AIMed test suite with live network queries enabled (AIMED_LIVE_NETWORK=1)...');

const env = { ...process.env, AIMED_LIVE_NETWORK: '1' };
const res = spawnSync('node', ['--test', 'src/lib/*.test.ts'], {
  stdio: 'inherit',
  shell: true,
  env
});

process.exit(res.status ?? 1);
