import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './tests/e2e/global-setup';

/**
 * Critical E2E flows against a real (local) Supabase. These run as part of
 * `npm run verify` whenever a local Supabase is reachable (see scripts/verify.mjs)
 * and in CI, which boots Supabase first. Specs are serial because they mutate
 * shared database state.
 */
const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    storageState: STORAGE_STATE,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
