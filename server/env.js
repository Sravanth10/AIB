import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load .env into process.env before anything else reads it.
 *
 * Node 20.6+ ships this natively as process.loadEnvFile, so there is no dependency to add.
 * Values already present in the real environment win — an explicitly exported variable
 * should always beat a file on disk.
 *
 * Import this FIRST in any entrypoint, before modules that read process.env at import time.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');

export function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return { loaded: false, path: ENV_FILE };

  const before = new Set(Object.keys(process.env));
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (err) {
    console.warn(`could not read .env: ${err.message}`);
    return { loaded: false, path: ENV_FILE, error: err.message };
  }

  // Report which keys arrived, never their values.
  const added = Object.keys(process.env).filter((k) => !before.has(k));
  return { loaded: true, path: ENV_FILE, keys: added };
}

loadEnv();
