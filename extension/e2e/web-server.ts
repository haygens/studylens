/**
 * The local StudyLens web API for E2E tests (P16): the real Next.js app from web/, run with
 * `next dev` on 127.0.0.1:3101 (the E2E build's compiled-in server, see server-urls.ts), with a
 * fresh local libSQL database file per run in web/.data/e2e/ (gitignored, on M: locally).
 * Playwright starts it before the tests and stops it afterwards (playwright.config.ts).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { E2E_API_BASE, E2E_API_PORT } from '../server-urls';

export const WEB_DIR = fileURLToPath(new URL('../../web', import.meta.url));
export const E2E_DB_DIR = path.join(WEB_DIR, '.data', 'e2e');

/**
 * This run's database file name (relative to web/). Chosen once and kept in an environment
 * variable, so the config (loaded again in each worker) and global-setup.ts agree on it.
 */
export function e2eDbName(): string {
  process.env.STUDYLENS_E2E_DB ??= `e2e-${process.pid}-${Date.now()}.db`;
  return process.env.STUDYLENS_E2E_DB;
}

/** `webServer` entry for playwright.config.ts. */
export function webServerConfig() {
  const dbFile = `.data/e2e/${e2eDbName()}`;
  return {
    command: `npx next dev --port ${E2E_API_PORT} --hostname 127.0.0.1`,
    cwd: WEB_DIR,
    url: `${E2E_API_BASE}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore' as const,
    stderr: 'pipe' as const,
    env: {
      // Relative to web/. Always set, so a web/.env.local can't point the tests elsewhere.
      TURSO_DATABASE_URL: `file:${dbFile}`,
      TURSO_AUTH_TOKEN: '',
      STUDYLENS_NEXT_DIST: '.next-e2e',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  };
}
