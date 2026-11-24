import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESENCE_TTL_MS, SHARING_DEFAULT, SHARING_OFF } from '@studylens/shared';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  useUpRateLimit,
  createTestGroup,
  joinTestGroup,
  overviewMember,
  sendPresence,
} from '@/lib/api/group-test-helpers';
import { registerTestDevice, useTestDb } from '@/lib/api/test-helpers';

const NOW = Date.UTC(2026, 10, 23, 15);

describe('POST /api/presence', () => {
  const t = useTestDb();
  afterEach(() => vi.useRealTimers());

  async function pair(samSharing = SHARING_DEFAULT) {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await createTestGroup(sam, samSharing);
    await joinTestGroup(alex, group.joinCode, SHARING_DEFAULT);
    return { sam, alex, group };
  }
  const samFocusing = async (alex: Awaited<ReturnType<typeof pair>>['alex'], groupId: string) =>
    (await overviewMember(alex, groupId, 'Sam'))?.focusingNow;

  it('start → focusing now; stop → not focusing', async () => {
    const { sam, alex, group } = await pair();
    expect(await samFocusing(alex, group.id)).toBe(false);
    const res = await sendPresence(sam, 'start');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, focusing: true });
    expect(await samFocusing(alex, group.id)).toBe(true);
    expect(await (await sendPresence(sam, 'stop')).json()).toEqual({ ok: true, focusing: false });
    expect(await samFocusing(alex, group.id)).toBe(false);
    const { rows } = await t().sql.execute({ sql: 'SELECT COUNT(*) AS n FROM device_presence' });
    expect(rows[0]!.n).toBe(0);
  });

  it('expires 3 minutes after the last heartbeat', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { sam, alex, group } = await pair();
    await sendPresence(sam, 'start');
    vi.setSystemTime(NOW + 2 * 60_000);
    await sendPresence(sam, 'heartbeat');
    vi.setSystemTime(NOW + 2 * 60_000 + PRESENCE_TTL_MS - 1);
    expect(await samFocusing(alex, group.id)).toBe(true);
    vi.setSystemTime(NOW + 2 * 60_000 + PRESENCE_TTL_MS);
    expect(await samFocusing(alex, group.id)).toBe(false);
    // A heartbeat after the gap (the extension was offline) shows it again.
    await sendPresence(sam, 'heartbeat');
    expect(await samFocusing(alex, group.id)).toBe(true);
  });

  it('stores nothing when no group shares "focusing now"', async () => {
    const { sam, alex, group } = await pair({ focusMinutes: true, focusingNow: false });
    expect(await (await sendPresence(sam, 'start')).json()).toEqual({
      ok: true,
      focusing: false,
    });
    expect(await samFocusing(alex, group.id)).toBeNull();
    const { rows } = await t().sql.execute({ sql: 'SELECT COUNT(*) AS n FROM device_presence' });
    expect(rows[0]!.n).toBe(0);
  });

  it('stores only device, since and expiry', async () => {
    const { sam } = await pair();
    await sendPresence(sam, 'start');
    const { rows } = await t().sql.execute({ sql: 'SELECT * FROM device_presence' });
    expect(Object.keys(rows[0]!).sort()).toEqual(['device_id', 'expires_at', 'since']);
  });

  it('validates the body strictly and needs a token', async () => {
    const sam = await registerTestDevice('Sam');
    await createTestGroup(sam, SHARING_OFF);
    for (const state of ['focusing', '', 'START']) {
      expect((await sendPresence(sam, state)).status).toBe(400);
    }
    const { POST } = await import('./route');
    const { makeRequest } = await import('@/lib/api/test-helpers');
    const extra = await POST(
      makeRequest('POST', '/api/presence', {
        json: { state: 'start', goal: 'essay' },
        headers: sam.headers,
      }),
    );
    expect(extra.status).toBe(400);
    const anon = await POST(makeRequest('POST', '/api/presence', { json: { state: 'start' } }));
    expect(anon.status).toBe(401);
  });

  it('is rate-limited per device', async () => {
    const { sam } = await pair();
    expect((await sendPresence(sam, 'heartbeat')).status).toBe(200);
    await useUpRateLimit(t(), RATE_LIMITS.sendPresence, sam);
    expect((await sendPresence(sam, 'heartbeat')).status).toBe(429);
  });
});
