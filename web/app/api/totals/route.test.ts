import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARING_DEFAULT, SHARING_OFF, type TotalsResponse } from '@studylens/shared';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  useUpRateLimit,
  createTestGroup,
  joinTestGroup,
  overviewMember,
  sendToday,
  sendTotals,
} from '@/lib/api/group-test-helpers';
import { EDGE_ORIGIN, makeRequest, registerTestDevice, useTestDb } from '@/lib/api/test-helpers';
import { OPTIONS } from './route';

/** 2026-11-23 15:00 UTC. */
const NOW = Date.UTC(2026, 10, 23, 15);

describe('POST /api/totals', () => {
  const t = useTestDb();
  afterEach(() => vi.useRealTimers());

  async function pair() {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await createTestGroup(sam, SHARING_DEFAULT);
    await joinTestGroup(alex, group.joinCode, SHARING_DEFAULT);
    return { sam, alex, group };
  }

  it('saves today’s minutes; other members see them', async () => {
    const { sam, alex, group } = await pair();
    const res = await sendToday(sam, 75);
    expect(res.status).toBe(200);
    expect((await res.json()) as TotalsResponse).toEqual({ ok: true, stored: 1 });
    const samSeen = await overviewMember(alex, group.id, 'Sam');
    expect(samSeen?.todayMinutes).toBe(75);
    // Sending again replaces the number (it is a total, not an increment).
    await sendToday(sam, 80);
    expect((await overviewMember(alex, group.id, 'Sam'))?.todayMinutes).toBe(80);
  });

  it('stores only the numbers: device, date, minutes, time', async () => {
    const { sam } = await pair();
    await sendToday(sam, 30);
    const { rows } = await t().sql.execute({ sql: 'SELECT * FROM daily_totals' });
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ['device_id', 'focus_minutes', 'local_date', 'updated_at'].sort(),
    );
  });

  it('saves nothing when no group shares focus minutes', async () => {
    const sam = await registerTestDevice('Sam');
    await createTestGroup(sam, SHARING_OFF);
    const res = await sendToday(sam, 30);
    expect(await res.json()).toEqual({ ok: true, stored: 0 });
    const { rows } = await t().sql.execute({ sql: 'SELECT COUNT(*) AS n FROM daily_totals' });
    expect(rows[0]!.n).toBe(0);
  });

  it('saves nothing for a device in no group', async () => {
    const sam = await registerTestDevice('Sam');
    expect(await (await sendToday(sam, 30)).json()).toEqual({ ok: true, stored: 0 });
  });

  it('accepts several days (offline catch-up)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { sam, alex, group } = await pair();
    const res = await sendTotals(sam, {
      days: [
        { localDate: '2026-11-21', focusMinutes: 40 },
        { localDate: '2026-11-22', focusMinutes: 0 },
        { localDate: '2026-11-23', focusMinutes: 25 },
      ],
    });
    expect(await res.json()).toEqual({ ok: true, stored: 3 });
    const samSeen = await overviewMember(alex, group.id, 'Sam');
    expect(samSeen?.history?.slice(-3).map((d) => d.focusMinutes)).toEqual([40, 0, 25]);
  });

  it('rejects impossible values', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { sam } = await pair();
    const bad: unknown[] = [
      { days: [{ localDate: '2026-11-23', focusMinutes: 1441 }] }, // more than a day
      { days: [{ localDate: '2026-11-23', focusMinutes: -1 }] },
      { days: [{ localDate: '2026-11-23', focusMinutes: 2.5 }] },
      { days: [{ localDate: '2026-11-23', focusMinutes: '30' }] },
      // 15:00 UTC: 2026-11-23 began up to 29 h ago (UTC+14), so 1440 is possible; but
      // 2026-11-24 began at most 5 h ago anywhere (10:00 UTC) → at most 300 minutes.
      { days: [{ localDate: '2026-11-24', focusMinutes: 301 }] },
      { days: [{ localDate: '2026-11-25', focusMinutes: 0 }] }, // hasn't started anywhere
      { days: [{ localDate: '2026-11-15', focusMinutes: 10 }] }, // older than 7 days
      { days: [{ localDate: '2026-02-30', focusMinutes: 10 }] }, // not a real date
      { days: [{ localDate: '23/11/2026', focusMinutes: 10 }] },
      { days: [] },
      {
        days: Array.from({ length: 8 }, (_, i) => ({
          localDate: `2026-11-1${i}`,
          focusMinutes: 1,
        })),
      },
      {
        days: [
          { localDate: '2026-11-23', focusMinutes: 1 },
          { localDate: '2026-11-23', focusMinutes: 2 },
        ],
      },
      // Strict: nothing else may come along.
      { days: [{ localDate: '2026-11-23', focusMinutes: 10, sites: ['youtube.com'] }] },
      { days: [{ localDate: '2026-11-23', focusMinutes: 10 }], goal: 'essay' },
    ];
    for (const json of bad) {
      const res = await sendTotals(sam, json);
      expect(res.status, JSON.stringify(json)).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    }
    // The edge of what is possible is accepted.
    expect(
      (await sendTotals(sam, { days: [{ localDate: '2026-11-24', focusMinutes: 300 }] })).status,
    ).toBe(200);
    expect(
      (await sendTotals(sam, { days: [{ localDate: '2026-11-16', focusMinutes: 1440 }] })).status,
    ).toBe(200);
    const { rows } = await t().sql.execute({
      sql: 'SELECT local_date FROM daily_totals ORDER BY local_date',
    });
    expect(rows.map((r) => r.local_date)).toEqual(['2026-11-16', '2026-11-24']);
  });

  it('needs a token and JSON', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeRequest('POST', '/api/totals', { json: { days: [] } }));
    expect(res.status).toBe(401);
    const sam = await registerTestDevice('Sam');
    const text = await POST(
      makeRequest('POST', '/api/totals', {
        body: 'days=1',
        headers: { ...sam.headers, 'content-type': 'text/plain' },
      }),
    );
    expect(text.status).toBe(415);
  });

  it('is rate-limited per device', async () => {
    const { sam } = await pair();
    await useUpRateLimit(t(), RATE_LIMITS.sendTotals, sam);
    const res = await sendToday(sam, 1);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('answers CORS preflight for the extension', async () => {
    const res = await OPTIONS(
      makeRequest('OPTIONS', '/api/totals', { headers: { origin: EDGE_ORIGIN } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
