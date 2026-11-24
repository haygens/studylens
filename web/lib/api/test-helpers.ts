/** Helpers for API route tests: a real temporary database file per test, and request builders. */
import { afterEach, beforeEach } from 'vitest';
import { resetClientRateLimits } from '@/lib/api/client-limit';
import { setDbForTests } from '@/lib/db';
import { openTestDb, preferredDriver, type TestDb } from '@/lib/db/test-utils';

export const EDGE_ORIGIN = 'chrome-extension://phepgpemnllainhhjemgknaeedjjekad';
export const FIREFOX_ORIGIN = 'moz-extension://3fa29c01-b7d4-4e5f-9a1b-2c3d4e5f6a7b';

/** Each test gets a fresh migrated libSQL file database (deleted afterwards). */
export function useTestDb(): () => TestDb {
  let t: TestDb | undefined;
  beforeEach(async () => {
    resetClientRateLimits();
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

export interface TestDevice {
  deviceId: string;
  token: string;
  /** Request headers with this device's bearer token (and a client address, if given). */
  headers: Record<string, string>;
}

/**
 * Registers a device through the real POST /api/devices route. `ip` sets x-forwarded-for, so
 * tests can stay under the per-address registration limit.
 */
export async function registerTestDevice(
  displayName: string,
  ip = '203.0.113.1',
): Promise<TestDevice> {
  const { POST } = await import('@/app/api/devices/route');
  const res = await POST(
    makeRequest('POST', '/api/devices', {
      json: { displayName },
      headers: { 'x-forwarded-for': ip },
    }),
  );
  if (res.status !== 201) throw new Error(`registration failed: ${res.status}`);
  const body = (await res.json()) as { deviceId: string; token: string };
  return {
    deviceId: body.deviceId,
    token: body.token,
    headers: { authorization: `Bearer ${body.token}`, 'x-forwarded-for': ip },
  };
}
