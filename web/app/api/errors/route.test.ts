import { beforeEach, describe, expect, it } from 'vitest';
import type { RegisterDeviceResponse } from '@studylens/shared';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { makeRequest, useTestDb } from '@/lib/api/test-helpers';
import { POST as registerDevice } from '../devices/route';
import { POST } from './route';

describe('POST /api/errors', () => {
  const t = useTestDb();
  let token: string;

  beforeEach(async () => {
    const res = await registerDevice(
      makeRequest('POST', '/api/devices', { json: { displayName: 'Sam' } }),
    );
    token = ((await res.json()) as RegisterDeviceResponse).token;
  });

  const report = (json: unknown, auth: string | null = `Bearer ${token}`) =>
    POST(
      makeRequest('POST', '/api/errors', {
        json,
        headers: auth ? { authorization: auth } : {},
      }),
    );

  it('stores a scrubbed message without the device id', async () => {
    const res = await report({
      message: 'Failed to load https://www.youtube.com/watch?v=1 for sam@uw.edu',
      context: 'background',
      extensionVersion: '0.5.0',
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });

    const { rows } = await t().sql.execute({ sql: 'SELECT * FROM error_logs' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'extension',
      route: 'background',
      message: 'Failed to load [url] for [email]',
      extension_version: '0.5.0',
    });
    const device = await t().sql.execute({ sql: 'SELECT id FROM devices' });
    expect(JSON.stringify(rows)).not.toContain(String(device.rows[0]!.id));
  });

  it('rejects requests without a valid token (401) and stores nothing', async () => {
    for (const auth of [null, 'Bearer slt_' + 'x'.repeat(43), 'Bearer garbage']) {
      const res = await report({ message: 'boom' }, auth);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
    }
    const { rows } = await t().sql.execute({ sql: 'SELECT COUNT(*) AS n FROM error_logs' });
    expect(rows[0]!.n).toBe(0);
  });

  it('rejects invalid reports (400)', async () => {
    for (const body of [
      {},
      { message: '' },
      { message: 'x'.repeat(501) },
      { message: 'x', context: 'somewhere' },
      { message: 'x', stack: 'at foo (https://a.b/c.js)' },
    ]) {
      const res = await report(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('rate-limits each device to 20 reports per hour', async () => {
    for (let i = 0; i < RATE_LIMITS.errorReport.limit; i++) {
      expect((await report({ message: `boom ${i}` })).status).toBe(202);
    }
    const res = await report({ message: 'one too many' });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();

    // A different device has its own budget.
    const other = await registerDevice(
      makeRequest('POST', '/api/devices', { json: { displayName: 'Alex' } }),
    );
    const otherToken = ((await other.json()) as RegisterDeviceResponse).token;
    expect((await report({ message: 'hi' }, `Bearer ${otherToken}`)).status).toBe(202);
  });
});
