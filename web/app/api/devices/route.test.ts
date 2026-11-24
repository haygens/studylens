import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorBody, RegisterDeviceResponse } from '@studylens/shared';
import { hashToken } from '@/lib/api/auth';
import { CLIENT_RATE_LIMITS, RATE_LIMITS } from '@/lib/api/rate-limit';
import { EDGE_ORIGIN, FIREFOX_ORIGIN, makeRequest, useTestDb } from '@/lib/api/test-helpers';
import { OPTIONS, POST } from './route';

const register = (json: unknown, headers: Record<string, string> = {}) =>
  POST(makeRequest('POST', '/api/devices', { json, headers }));

describe('POST /api/devices', () => {
  const t = useTestDb();
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('registers a device and returns the token once; only its hash is stored', async () => {
    const res = await register({ displayName: '  Sam ' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RegisterDeviceResponse;
    expect(body.displayName).toBe('Sam');
    expect(body.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.token).toMatch(/^slt_/);

    const { rows } = await t().sql.execute({ sql: 'SELECT * FROM devices' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(hashToken(body.token));
    expect(JSON.stringify(rows)).not.toContain(body.token);
    expect(await t().db.findDeviceByTokenHash(hashToken(body.token))).toMatchObject({
      id: body.deviceId,
      displayName: 'Sam',
    });
  });

  it('gives every device a different id and token', async () => {
    const a = (await (await register({ displayName: 'A' })).json()) as RegisterDeviceResponse;
    const b = (await (await register({ displayName: 'B' })).json()) as RegisterDeviceResponse;
    expect(a.deviceId).not.toBe(b.deviceId);
    expect(a.token).not.toBe(b.token);
  });

  it('rejects invalid input with a consistent JSON error', async () => {
    const res = await register({ displayName: 'sam@uw.edu' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(body).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    expect(body.error.details?.[0]?.path).toBe('displayName');
    const { rows } = await t().sql.execute({ sql: 'SELECT COUNT(*) AS n FROM devices' });
    expect(rows[0]!.n).toBe(0);
  });

  it('rejects extra fields (nothing else can be stored)', async () => {
    const res = await register({ displayName: 'Sam', email: 'sam@uw.edu' });
    expect(res.status).toBe(400);
  });

  it('rate-limits registrations per client address (in memory), not globally', async () => {
    const from = (ip: string, name: string) =>
      register({ displayName: name }, { 'x-forwarded-for': ip });
    for (let i = 0; i < CLIENT_RATE_LIMITS.registerDevice.limit; i++) {
      expect((await from('203.0.113.1', `n${i}`)).status).toBe(201);
    }
    const res = await from('203.0.113.1', 'one too many');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
    // Someone on another network can still register.
    expect((await from('203.0.113.2', 'other')).status).toBe(201);
    // No IP address is stored anywhere in the database.
    const dump = JSON.stringify(
      await Promise.all(
        ['devices', 'rate_limits', 'error_logs'].map((table) =>
          t().sql.execute({ sql: `SELECT * FROM ${table}` }),
        ),
      ),
    );
    expect(dump).not.toContain('203.0.113');
  });

  it('keeps a global backstop in the database (429 once it is exceeded)', async () => {
    vi.spyOn(t().db, 'hitRateLimit').mockResolvedValue(RATE_LIMITS.registerDevice.limit + 1);
    const res = await register({ displayName: 'Sam' });
    expect(res.status).toBe(429);
  });

  it('works from the Firefox extension origin and blocks websites (CORS)', async () => {
    const ok = await register({ displayName: 'Sam' }, { origin: FIREFOX_ORIGIN });
    expect(ok.status).toBe(201);
    expect(ok.headers.get('access-control-allow-origin')).toBe(FIREFOX_ORIGIN);

    const blocked = await register({ displayName: 'Sam' }, { origin: 'https://evil.example' });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
    expect(await blocked.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });
  });

  it('blocks localhost in production but allows the Edge store build', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await register({ displayName: 'S' }, { origin: 'http://localhost:3000' })).status).toBe(
      403,
    );
    expect((await register({ displayName: 'S' }, { origin: EDGE_ORIGIN })).status).toBe(201);
  });

  it('preflight: 204 for the extension, 403 for other origins', async () => {
    const ok = await OPTIONS(
      makeRequest('OPTIONS', '/api/devices', { headers: { origin: EDGE_ORIGIN } }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-headers')).toContain('Authorization');
    const bad = await OPTIONS(
      makeRequest('OPTIONS', '/api/devices', { headers: { origin: 'https://evil.example' } }),
    );
    expect(bad.status).toBe(403);
  });

  it('logs unexpected errors to error_logs (scrubbed) and returns a generic 500', async () => {
    vi.spyOn(t().db, 'createDevice').mockRejectedValue(
      new Error('disk I/O error near https://example.com/x'),
    );
    const res = await register({ displayName: 'Sam' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error).toEqual({ code: 'internal_error', message: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('disk');
    const logs = await t().db.listErrorLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      source: 'server',
      route: '/api/devices',
      message: 'Error: disk I/O error near [url]',
    });
  });
});
