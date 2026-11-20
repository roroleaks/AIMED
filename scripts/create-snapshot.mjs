import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
const distZip = path.join(distDir, 'aimed-snapshot.zip');
const scratchDir = process.env.AIMED_SNAPSHOT_DIR || path.resolve(projectRoot, '..');
const snapshotZip = path.join(scratchDir, 'aimed-snapshot.zip');
const tempStageDir = path.join(distDir, '_aimed_snapshot_staging');

console.log('📦 Creating AIMed clean snapshot archive...');
console.log(`Source: ${projectRoot}`);
console.log(`Target (local): ${distZip}`);
if (snapshotZip !== distZip) {
  console.log(`Target (scratch/PC): ${snapshotZip}`);
}

// Clean previous staging directory if exists
if (fs.existsSync(tempStageDir)) {
  fs.rmSync(tempStageDir, { recursive: true, force: true });
}
fs.mkdirSync(tempStageDir, { recursive: true });

// Copy all files and folders excluding node_modules, .next, .git, .vercel, dist, .env*, *.tsbuildinfo
const EXCLUDE_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', 'dist', '_aimed_snapshot_staging']);
const EXCLUDE_FILES = new Set(['aimed-snapshot.zip']);

function shouldExclude(name) {
  if (EXCLUDE_DIRS.has(name) || EXCLUDE_FILES.has(name)) return true;
  if (name.startsWith('.env')) return true;
  if (name.endsWith('.tsbuildinfo')) return true;
  return false;
}

function copyDirRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldExclude(entry.name)) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  copyDirRecursive(projectRoot, tempStageDir);
  console.log('✅ Staged files copied successfully.');

  // Compress: PowerShell on Windows, `zip` on macOS / Linux.
  if (fs.existsSync(distZip)) fs.rmSync(distZip);
  if (process.platform === 'win32') {
    const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${tempStageDir}\\*' -DestinationPath '${distZip}' -Force"`;
    execSync(psCmd, { stdio: 'inherit' });
  } else {
    execSync(`zip -qr "${distZip}" .`, { cwd: tempStageDir, stdio: 'inherit' });
  }

  // Copy to parent/scratch dir if configured and distinct
  if (snapshotZip !== distZip) {
    try {
      fs.copyFileSync(distZip, snapshotZip);
      console.log(`✅ Copied to scratch/PC snapshot: ${snapshotZip}`);
    } catch (copyErr) {
      console.warn(`⚠️ Could not copy snapshot to ${snapshotZip}: ${copyErr.message}`);
    }
  }

  const stats = fs.statSync(distZip);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`🎉 Snapshot created successfully at: ${distZip} (${sizeMB} MB)`);
} finally {
  if (fs.existsSync(tempStageDir)) {
    fs.rmSync(tempStageDir, { recursive: true, force: true });
  }
}
