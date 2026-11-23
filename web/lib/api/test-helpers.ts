/** Helpers for API route tests: a real temporary database file per test, and request builders. */
import { afterEach, beforeEach } from 'vitest';
import { setDbForTests } from '@/lib/db';
import { openTestDb, preferredDriver, type TestDb } from '@/lib/db/test-utils';

export const EDGE_ORIGIN = 'chrome-extension://phepgpemnllainhhjemgknaeedjjekad';
export const FIREFOX_ORIGIN = 'moz-extension://3fa29c01-b7d4-4e5f-9a1b-2c3d4e5f6a7b';

/** Each test gets a fresh migrated libSQL file database (deleted afterwards). */
export function useTestDb(): () => TestDb {
  let t: TestDb | undefined;
  beforeEach(async () => {
    t = await openTestDb(await preferredDriver());
    setDbForTests(t.db);
  });
  afterEach(async () => {
    setDbForTests(undefined);
    await t?.dispose();
    t = undefined;
  });
  return () => t!;
}

export function makeRequest(
  method: string,
  path: string,
  opts: { json?: unknown; body?: string; headers?: Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = { ...opts.headers };
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['content-type'] ??= 'application/json';
  }
  return new Request(`http://localhost:3000${path}`, { method, headers, body });
}
