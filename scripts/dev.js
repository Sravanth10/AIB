#!/usr/bin/env node
/** Runs the API and the Vite dev server together, so `npm run dev` is the only command. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const children = [
  spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: 'inherit' }),
  spawn(npx, ['vite'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' }),
];

const shutdown = () => {
  for (const c of children) if (!c.killed) c.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const c of children) c.on('exit', shutdown);
