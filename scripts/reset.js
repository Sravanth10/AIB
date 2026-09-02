#!/usr/bin/env node
/**
 * Closes reporting periods back down, leaving the synthetic source templates intact.
 *
 *   npm run reset               every period (dashboard goes empty)
 *   npm run reset -- 2026-09    just that period — the usual case before a rehearsal,
 *                               since it keeps July and August on the dashboard
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const months = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));

if (months.length) {
  for (const m of months) {
    const uploads = path.join(ROOT, 'data', 'uploads', m);
    const analysis = path.join(ROOT, 'data', 'analyses', `${m}.json`);
    if (fs.existsSync(uploads)) fs.rmSync(uploads, { recursive: true, force: true });
    if (fs.existsSync(analysis)) fs.rmSync(analysis, { force: true });
    console.log(`closed reporting period ${m}`);
  }
} else {
  for (const dir of ['uploads', 'analyses']) {
    const target = path.join(ROOT, 'data', dir);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`cleared data/${dir}`);
    }
  }
}
console.log('Sample source files in data/seed and data/holdback were left in place.');
