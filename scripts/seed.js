#!/usr/bin/env node
/**
 * Generates the synthetic source templates - one realistic file per source type, per month.
 *
 *   node scripts/seed.js                 all months in scenario.js
 *   node scripts/seed.js 2026-08         one month
 *
 * Output:
 *   data/seed/<month>/     the files the demo starts with
 *   data/holdback/         files withheld for the mid-demo "upload one more" beat
 *   data/seed/manifest.json  expected metric roll-ups, so the SLA engine can be verified
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONTHS, SCENARIO } from './scenario.js';
import { monthLabel } from './lib/dates.js';
import { generateBancs } from './generators/bancs.js';
import { generateAwsConnect } from './generators/awsConnect.js';
import { generateAzure } from './generators/azure.js';
import { generateTracker } from './generators/tracker.js';
import { generateEmailFeed } from './generators/emailFeed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = path.join(ROOT, 'data', 'seed');
const HOLDBACK_DIR = path.join(ROOT, 'data', 'holdback');

const SOURCES = [
  { id: 'bancs', label: 'BaNCS extract', run: generateBancs },
  { id: 'awsConnect', label: 'AWS Connect report', run: generateAwsConnect },
  { id: 'azure', label: 'Azure operational report', run: generateAzure },
  { id: 'tracker', label: 'Excel tracker', run: generateTracker },
  { id: 'emailFeed', label: 'Email feed', run: generateEmailFeed },
];

const args = process.argv.slice(2);
const months = args.length ? args : MONTHS;

// Merge into any existing manifest rather than replacing it: seeding a single month must
// not erase the other months' entries, which the sample/holdback lookup depends on.
const manifestPath = path.join(SEED_DIR, 'manifest.json');
let manifest = { generatedAt: new Date().toISOString(), months: {} };
if (fs.existsSync(manifestPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest = { ...existing, generatedAt: new Date().toISOString(), months: existing.months ?? {} };
  } catch {
    /* corrupt manifest — start fresh */
  }
}

for (const monthKey of months) {
  const sc = SCENARIO[monthKey];
  if (!sc) {
    console.error(`  ! no scenario defined for ${monthKey} - add it to scripts/scenario.js`);
    process.exitCode = 1;
    continue;
  }

  const monthDir = path.join(SEED_DIR, monthKey);
  fs.mkdirSync(monthDir, { recursive: true });
  fs.mkdirSync(HOLDBACK_DIR, { recursive: true });

  console.log(`\n${monthLabel(monthKey)}  (${monthKey})`);

  const files = [];
  for (const src of SOURCES) {
    const held = sc.holdback.includes(src.id);
    const dir = held ? HOLDBACK_DIR : monthDir;
    const filename = sc.files[src.id];
    const outPath = path.join(dir, filename);

    const stats = await src.run(monthKey, outPath);
    const bytes = fs.statSync(outPath).size;

    files.push({
      source: src.label,
      sourceId: src.id,
      file: path.relative(ROOT, outPath).replace(/\\/g, '/'),
      heldBack: held,
      bytes,
      stats,
    });

    console.log(
      `  ${held ? 'HELD' : ' ok '}  ${src.label.padEnd(26)} ${filename.padEnd(42)} ${(bytes / 1024).toFixed(1)} KB`,
    );
  }

  manifest.months[monthKey] = {
    label: monthLabel(monthKey),
    expectedMetrics: sc.values,
    azureCoverage: sc.azureCoverage,
    files,
  };
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nmanifest -> ${path.relative(ROOT, manifestPath).replace(/\\/g, '/')} (${Object.keys(manifest.months).length} months)`);
