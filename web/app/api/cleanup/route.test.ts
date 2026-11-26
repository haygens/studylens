import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, useTestDb } from '@/lib/api/test-helpers';
import { ERROR_LOG_MAX_AGE_MS } from '@/lib/db/retention';
import { GET } from './route';

const SECRET = 'test-cron-secret-0123456789abcdef';
const call = (auth?: string) =>
  GET(makeRequest('GET', '/api/cleanup', { headers: auth ? { authorization: auth } : {} }));

describe('GET /api/cleanup', () => {
  const t = useTestDb();
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses to run when CRON_SECRET is not set (503)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'not_configured' } });
  });

  it('rejects a missing or wrong secret (401)', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401);
  });

  it('deletes old error logs and expired goals with the right secret', async () => {
    const now = Date.now();
    await t().db.addErrorLog({
      source: 'server',
      route: null,
      message: 'old',
      extensionVersion: null,
      createdAt: now - ERROR_LOG_MAX_AGE_MS - 60_000,
    });
    await t().db.addErrorLog({
      source: 'server',
      route: null,
      message: 'new',
      extensionVersion: null,
      createdAt: now,
    });
    await t().sql.batch([
      {
        sql: "INSERT INTO devices VALUES ('d1', 'Sam', ?, ?, ?)",
        args: ['a'.repeat(64), now, now],
      },
      { sql: "INSERT INTO groups VALUES ('g1', 'G', 'ABC123', 'd1', ?)", args: [now] },
      {
        sql: "INSERT INTO group_sessions VALUES ('s1', 'g1', 'd1', 'Read ch. 3', 25, ?, ?, ?, NULL)",
        args: [
          now - 3 * 86_400_000,
          now - 3 * 86_400_000 + 25 * 60_000,
          now - 3 * 86_400_000 + 25 * 60_000,
        ],
      },
    ]);

    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      errorLogsDeleted: 1,
      goalsCleared: 1,
      groupSessionsDeleted: 1,
    });
    expect((await t().db.listErrorLogs()).map((l) => l.message)).toEqual(['new']);
    // P18b: the live session (goal included) is gone 24 h after its end.
    const { rows } = await t().sql.execute({ sql: 'SELECT goal FROM group_sessions' });
    expect(rows).toEqual([]);
  });
});
