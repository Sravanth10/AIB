import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const ANALYSES_DIR = path.join(DATA_DIR, 'analyses');
export const SEED_DIR = path.join(DATA_DIR, 'seed');
export const HOLDBACK_DIR = path.join(DATA_DIR, 'holdback');

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const isMonthKey = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s));

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_FULL[m - 1]} ${y}`;
}

const ensure = (dir) => fs.mkdirSync(dir, { recursive: true });

// --- uploaded source files, kept per reporting month ------------------------
// Files persist so a regenerate can re-read everything uploaded so far. That is what makes
// "upload one more file mid-demo and regenerate" produce a complete pack rather than one
// built from the newest upload alone.

const monthUploadDir = (monthKey) => path.join(UPLOAD_DIR, monthKey);
const indexPath = (monthKey) => path.join(monthUploadDir(monthKey), '_index.json');

export function readUploadIndex(monthKey) {
  const p = indexPath(monthKey);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

export function writeUploadIndex(monthKey, entries) {
  ensure(monthUploadDir(monthKey));
  fs.writeFileSync(indexPath(monthKey), JSON.stringify(entries, null, 2) + '\n');
  return entries;
}

export function saveUploadFile(monthKey, uploadId, originalName, buffer) {
  ensure(monthUploadDir(monthKey));
  const ext = (originalName.split('.').pop() || 'bin').toLowerCase();
  const stored = `${uploadId}.${ext}`;
  fs.writeFileSync(path.join(monthUploadDir(monthKey), stored), buffer);
  return stored;
}

export function readUploadFile(monthKey, storedName) {
  return fs.readFileSync(path.join(monthUploadDir(monthKey), storedName));
}

export function deleteUploadFile(monthKey, storedName) {
  const p = path.join(monthUploadDir(monthKey), storedName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// --- stored analyses: exactly one current version per month -----------------

export function analysisPath(monthKey) {
  return path.join(ANALYSES_DIR, `${monthKey}.json`);
}

export function readAnalysis(monthKey) {
  const p = analysisPath(monthKey);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Overwrite-on-regenerate. One current pack per month, no parallel drafts. */
export function writeAnalysis(monthKey, analysis) {
  ensure(ANALYSES_DIR);
  fs.writeFileSync(analysisPath(monthKey), JSON.stringify(analysis, null, 2) + '\n');
  return analysis;
}

/**
 * The reporting months that exist as workspaces.
 *
 * A month appears once governance has actually been STARTED for it — files uploaded, or a
 * pack generated. Sample files sitting on disk do not conjure a month onto the dashboard;
 * the user opens a period deliberately.
 */
export function listMonths() {
  const months = new Set();
  for (const dir of [UPLOAD_DIR, ANALYSES_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const key = name.replace(/\.json$/, '');
      if (isMonthKey(key)) months.add(key);
    }
  }
  return [...months].sort().reverse();
}

/** Open a reporting period. Idempotent — reopening an existing month keeps its contents. */
export function createSpace(monthKey) {
  const dir = monthUploadDir(monthKey);
  const existed = fs.existsSync(dir);
  ensure(dir);
  if (!fs.existsSync(indexPath(monthKey))) writeUploadIndex(monthKey, []);
  return { month: monthKey, created: !existed };
}

/** Current reporting period, from the system clock. */
export function currentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// --- sample files, for the "load samples" affordance ------------------------

export function listSampleFiles(monthKey) {
  const out = [];
  const dir = path.join(SEED_DIR, monthKey);
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('_') || name.endsWith('.json')) continue;
      out.push({ name, absolute: path.join(dir, name), heldBack: false });
    }
  }
  if (fs.existsSync(HOLDBACK_DIR)) {
    const manifestPath = path.join(SEED_DIR, 'manifest.json');
    let held = [];
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        held = (manifest.months?.[monthKey]?.files ?? []).filter((f) => f.heldBack).map((f) => path.basename(f.file));
      } catch {
        held = [];
      }
    }
    for (const name of fs.readdirSync(HOLDBACK_DIR)) {
      if (!held.includes(name)) continue;
      out.push({ name, absolute: path.join(HOLDBACK_DIR, name), heldBack: true });
    }
  }
  return out;
}
