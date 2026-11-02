import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..', 'src');

console.log('🔍 Scanning src/ for secret patterns and API key leaks...');

const SUSPICIOUS_PATTERNS = [
  { name: 'Semantic Scholar API key', regex: /s2k-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI/Standard Secret Key', regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub Personal Access Token', regex: /ghp_[A-Za-z0-9]{20,}/ },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/ },
  { name: 'Private Key header', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ }
];

let violations = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const pat of SUSPICIOUS_PATTERNS) {
    if (pat.regex.test(content)) {
      violations.push({
        file: path.relative(path.resolve(__dirname, '..'), filePath),
        pattern: pat.name
      });
    }
  }
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) {
      scanFile(fullPath);
    }
  }
}

walkDir(srcDir);

if (violations.length > 0) {
  console.error('❌ SECRET SCAN FAILED! Found potential secrets in source code:');
  for (const v of violations) {
    console.error(`  - ${v.file}: matched pattern "${v.pattern}"`);
  }
  process.exit(1);
} else {
  console.log('✅ Clean! 0 hardcoded secrets found in src/.');
}
