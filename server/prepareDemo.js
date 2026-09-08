import fs from 'node:fs';

import { ingest, generate } from './pipeline.js';
import { listSampleFiles, monthLabel } from './store.js';

/**
 * Builds the demo starting state:
 *
 *   July 2026       closed pack, all 5 sources
 *   August 2026     closed pack, 4 of 5 — the Excel tracker is held back
 *   September 2026  not opened; the live run starts there
 *
 * Uses the same pipeline the UI does, so a prepared state is indistinguishable from one
 * built by hand. Called both by `npm run demo` and by the server on a cold start.
 */
export const DEMO_PLAN = [
  { month: '2026-07', include: 'all' },
  { month: '2026-08', include: 'not-held-back' },
];

export async function prepareDemo({ log = () => {} } = {}) {
  const built = [];

  for (const step of DEMO_PLAN) {
    const files = listSampleFiles(step.month).filter((f) => (step.include === 'all' ? true : !f.heldBack));
    if (!files.length) {
      log(`  !  ${monthLabel(step.month)} — no sample files found, skipped`);
      continue;
    }

    const { added, skipped } = await ingest(
      step.month,
      files.map((f) => ({ originalName: f.name, buffer: fs.readFileSync(f.absolute) })),
    );
    const analysis = await generate(step.month);
    const s = analysis.summary;

    log(
      `  ok ${monthLabel(step.month).padEnd(16)} ${added.length} sources · ` +
        `${s.GREEN} on target, ${s.AMBER} at risk, ${s.RED} breach, ${s.NO_DATA} unscored · ` +
        `${s.serviceCreditBreaches} service-credit`,
    );
    for (const sk of skipped) log(`     ! skipped ${sk.filename}: ${sk.error}`);
    built.push(step.month);
  }

  return built;
}
