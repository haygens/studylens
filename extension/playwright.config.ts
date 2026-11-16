import { defineConfig } from '@playwright/test';

/**
 * E2E tests for the extension (P5b). Run with `npm run test:e2e` (builds the E2E version first).
 * Add `-- --headed` to watch the browser. See e2e/fixtures.ts for how the extension is loaded.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // One browser at a time: each test launches its own browser profile with the extension.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  outputDir: 'test-results',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
