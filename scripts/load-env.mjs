import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal .env loader (no dependency). Loads .env.local then .env from the
 * project root into process.env WITHOUT overwriting values already set (so CI
 * secrets always win). Used by verify.mjs so `npm run verify` picks up local
 * Supabase credentials for the Playwright step.
 */
export function loadEnvFiles(root = process.cwd()) {
  for (const file of ['.env.local', '.env']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
