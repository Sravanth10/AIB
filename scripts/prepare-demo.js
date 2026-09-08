#!/usr/bin/env node
/**
 * Puts the app into the exact state the demo starts from, reproducibly.
 *
 * IMPORTANT: stop the server before running this. On Windows a running server holds handles
 * on the uploaded files, and the delete silently fails to complete — you get a period that
 * looks cleared but comes back.
 */
import fs from 'node:fs';
import path from 'node:path';

import { prepareDemo } from '../server/prepareDemo.js';
import { DATA_DIR, listSampleFiles } from '../server/store.js';

function wipeAll() {
  for (const d of ['uploads', 'analyses']) {
    const dir = path.join(DATA_DIR, d);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const key = name.replace(/\.json$/, '');
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const target = path.join(dir, name);
      fs.rmSync(target, { recursive: true, force: true });
      if (fs.existsSync(target)) throw new Error(`could not clear ${target} — is the server still running?`);
    }
  }
}

wipeAll();
await prepareDemo({ log: console.log });

const held = listSampleFiles('2026-08').filter((f) => f.heldBack);
console.log('\nSeptember 2026 is closed — start it from the dashboard for the live run.');
if (held.length) console.log(`August's late-arriving file is held back: ${held.map((f) => f.name).join(', ')}`);
