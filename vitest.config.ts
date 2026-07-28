import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Domain + integration tests live under tests/unit and tests/integration.
    // Playwright specs under tests/e2e are excluded (run via `npm run test:e2e`).
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'tests/e2e'],
    reporters: 'default',
  },
});
