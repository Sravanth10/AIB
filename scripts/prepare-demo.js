#!/usr/bin/env node
/**
 * Puts the app into the exact state the demo starts from, reproducibly:
 *
 *   July 2026       closed pack, all 5 sources        2 breaches
 *   August 2026     closed pack, 4 of 5 sources       6 breaches, tracker held back
 *   September 2026  not opened — the live run starts here
 *
 * Uses the same ingestion and generation pipeline the UI does, so a prepared state is
 * indistinguishable from one built by hand.
 *
 * IMPORTANT: stop the server before running this. On Windows a running server holds handles
 * on the uploaded files, and the delete silently fails to complete.
 */
import fs from 'node:fs';
import path from 'node:path';

import { ingest, generate } from '../server/pipeline.js';
import { ROOT, listSampleFiles, monthLabel } from '../server/store.js';

const PLAN = [
  { month: '2026-07', include: 'all' },
  { month: '2026-08', include: 'not-held-back' },
  // September is deliberately absent: the demo opens it live.
];

function wipe(monthKey) {
  const uploads = path.join(ROOT, 'data', 'uploads', monthKey);
  const analysis = path.join(ROOT, 'data', 'analyses', `${monthKey}.json`);
  if (fs.existsSync(uploads)) fs.rmSync(uploads, { recursive: true, force: true });
  if (fs.existsSync(analysis)) fs.rmSync(analysis, { force: true });
  if (fs.existsSync(uploads)) throw new Error(`could not clear ${uploads} — is the server still running?`);
}

// Clear everything first, including any period not in the plan.
const dataDirs = ['uploads', 'analyses'];
for (const d of dataDirs) {
  const dir = path.join(ROOT, 'data', d);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    const key = name.replace(/\.json$/, '');
    if (/^\d{4}-\d{2}$/.test(key)) wipe(key);
  }
}

for (const step of PLAN) {
  const files = listSampleFiles(step.month).filter((f) => (step.include === 'all' ? true : !f.heldBack));
  if (!files.length) {
    console.log(`  !  ${monthLabel(step.month)} — no sample files found, skipped`);
    continue;
  }

  const { added, skipped } = await ingest(
    step.month,
    files.map((f) => ({ originalName: f.name, buffer: fs.readFileSync(f.absolute) })),
  );
  const analysis = await generate(step.month);
  const s = analysis.summary;

  console.log(
    `  ok ${monthLabel(step.month).padEnd(16)} ${added.length} sources · ` +
      `${s.GREEN} on target, ${s.AMBER} at risk, ${s.RED} breach, ${s.NO_DATA} unscored · ` +
      `${s.serviceCreditBreaches} service-credit`,
  );
  for (const sk of skipped) console.log(`     ! skipped ${sk.filename}: ${sk.error}`);
}

const held = listSampleFiles('2026-08').filter((f) => f.heldBack);
console.log('\nSeptember 2026 is closed — start it from the dashboard for the live run.');
if (held.length) console.log(`August's late-arriving file is held back: ${held.map((f) => f.name).join(', ')}`);
