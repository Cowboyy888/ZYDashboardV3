#!/usr/bin/env node
/**
 * `npm run verify` — the single quality gate for Zysteel Operations.
 *
 * Static steps (always run): format, lint, type-check, unit/integration tests,
 * schema validation, build.
 *
 * Playwright critical flows (attendance entry, stock transfer, report preview,
 * smoke) run as a first-class step against a LOCAL Supabase:
 *   - It runs automatically whenever Supabase is reachable at
 *     NEXT_PUBLIC_SUPABASE_URL and a service-role key is present (e.g. after
 *     `supabase start`), and in CI (which boots Supabase first).
 *   - If Supabase is not reachable it is skipped with a clear message, UNLESS
 *     REQUIRE_E2E=1 is set (CI sets it) — then a missing backend fails verify.
 *
 * Env is auto-loaded from .env.local / .env so local runs pick up credentials.
 */
import { execSync } from 'node:child_process';
import { loadEnvFiles } from './load-env.mjs';

loadEnvFiles();

const staticSteps = [
  { name: 'format', cmd: 'npm run format' },
  { name: 'lint', cmd: 'npm run lint' },
  { name: 'typecheck', cmd: 'npm run typecheck' },
  { name: 'test', cmd: 'npm run test' },
  { name: 'schema', cmd: 'npm run db:validate' },
  { name: 'build', cmd: 'npm run build' },
];

function run(step) {
  process.stdout.write(`▶ ${step.name.padEnd(9)} … `);
  const t0 = Date.now();
  try {
    execSync(step.cmd, { stdio: 'pipe', env: process.env });
    console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    console.log('FAILED');
    console.error(`\n✗ Step "${step.name}" failed:\n`);
    if (err.stdout) process.stderr.write(err.stdout.toString());
    if (err.stderr) process.stderr.write(err.stderr.toString());
    console.error(`\nRun \`${step.cmd}\` to reproduce.`);
    process.exit(1);
  }
}

async function supabaseReachable(url) {
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

const started = Date.now();
console.log('\n=== Zysteel Operations · verify ===\n');

for (const step of staticSteps) run(step);

// --- Playwright e2e against local Supabase -----------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const reachable = url ? await supabaseReachable(url) : false;
const requireE2e = process.env.REQUIRE_E2E === '1';

if (reachable && hasServiceKey) {
  run({ name: 'e2e', cmd: 'npm run test:e2e' });
} else if (requireE2e) {
  console.error(
    `\n✗ Step "e2e" required but local Supabase is not ready.\n` +
      `  URL: ${url ?? '(unset)'}  reachable: ${reachable}  serviceKey: ${hasServiceKey}\n` +
      `  Start it with \`supabase start\` (and set env) before running verify.`,
  );
  process.exit(1);
} else {
  console.log(
    `▶ e2e       … skipped (local Supabase not reachable at ${url ?? 'NEXT_PUBLIC_SUPABASE_URL'}).\n` +
      `             Run \`supabase start\` to include it, or set REQUIRE_E2E=1 to enforce.`,
  );
}

console.log(`\n✅ verify passed in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
