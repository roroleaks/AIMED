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

console.log('\n======================================================================');
console.log('📊 Live Literature Sources Health Status (11 Sources Probe)');
console.log('======================================================================');

try {
  const { searchMultiSourceLiterature, sourceStatusSnapshot, SEARCH_SOURCE_OPTIONS } = await import('../src/lib/literature-sources.ts');

  // Probe standard query across all 11 sources
  await searchMultiSourceLiterature({
    query: "dapagliflozin heart failure",
    maxResults: 11
  });

  const snap = sourceStatusSnapshot();
  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;

  console.log('Source ID          Status      Hits   Latency   Details');
  console.log('----------------------------------------------------------------------');
  for (const opt of SEARCH_SOURCE_OPTIONS) {
    const s = snap[opt.id];
    let statusStr = 'UNKNOWN';
    let details = '';

    if (!s || !s.attempted) {
      if (s?.skipped === 'no_key') {
        statusStr = 'SKIPPED';
        details = 'no API key';
        skipCount++;
      } else if (s?.skipped === 'offline') {
        statusStr = 'OFFLINE';
        details = 'offline mode';
        skipCount++;
      } else if (s?.skipped === 'cooldown') {
        statusStr = 'COOLDOWN';
        details = s.error || 'rate-limited';
        skipCount++;
      } else {
        statusStr = 'NOT_ATTEMPTED';
        skipCount++;
      }
    } else if (s.ok) {
      statusStr = 'OK';
      details = `${s.hits} hits`;
      okCount++;
    } else {
      statusStr = 'ERROR';
      details = s.error || 'failed';
      errCount++;
    }

    const idCol = opt.id.padEnd(18);
    const stCol = statusStr.padEnd(12);
    const hitCol = String(s?.hits ?? 0).padEnd(7);
    const msCol = `${s?.ms ?? 0}ms`.padEnd(10);
    console.log(`${idCol} ${stCol} ${hitCol} ${msCol} ${details}`);
  }
  console.log('======================================================================');
  console.log(`Summary: 11 sources attempted, ${okCount} OK, ${skipCount} skipped/cooldown, ${errCount} errors`);
  console.log('======================================================================\n');
} catch (probeErr) {
  console.warn('Could not run source health summary probe:', probeErr.message);
}

process.exit(res.status ?? 1);
