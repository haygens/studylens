import { afterEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests } from '@/lib/db';
import { createMemoryDb } from '@/lib/db/memory';
import { EDGE_ORIGIN, makeRequest, useTestDb } from '@/lib/api/test-helpers';
import pkg from '@/package.json';
import { GET, OPTIONS } from './route';

describe('GET /api/health', () => {
  useTestDb();

  it('reports ok, db up and the version', async () => {
    const res = await GET(makeRequest('GET', '/api/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: 'up', version: pkg.version });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('adds CORS headers for an allowed extension origin', async () => {
    const res = await GET(makeRequest('GET', '/api/health', { headers: { origin: EDGE_ORIGIN } }));
    expect(res.headers.get('access-control-allow-origin')).toBe(EDGE_ORIGIN);
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('answers a CORS preflight', async () => {
    const res = await OPTIONS(
      makeRequest('OPTIONS', '/api/health', { headers: { origin: EDGE_ORIGIN } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
  });
});

describe('GET /api/health when the database is down', () => {
  afterEach(() => {
    setDbForTests(undefined);
    vi.restoreAllMocks();
  });

  it('returns 503 with db: "down"', async () => {
    const db = createMemoryDb();
    db.ping = () => Promise.reject(new Error('connection refused'));
    setDbForTests(db);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(makeRequest('GET', '/api/health'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: 'down' });
  });
});
