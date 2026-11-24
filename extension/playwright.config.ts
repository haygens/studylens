import { defineConfig } from '@playwright/test';
import { webServerConfig } from './e2e/web-server';

/**
 * E2E tests for the extension (P5b). Run with `npm run test:e2e` (builds the E2E version first).
 * Add `-- --headed` to watch the browser. See e2e/fixtures.ts for how the extension is loaded.
 * Study group tests (P16) talk to a local copy of the web API, started here (e2e/web-server.ts).
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
    ? // `github` turns each failure into an annotation on the Actions run (readable without logs).
      [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  outputDir: 'test-results',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  globalSetup: './e2e/global-setup.ts',
  webServer: webServerConfig(),
});
