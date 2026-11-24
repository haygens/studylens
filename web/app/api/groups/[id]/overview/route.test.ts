import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARING_DEFAULT, SHARING_OFF, type GroupOverviewResponse } from '@studylens/shared';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  useUpRateLimit,
  createTestGroup,
  fetchOverview,
  joinTestGroup,
  sendPresence,
  sendTotals,
} from '@/lib/api/group-test-helpers';
import { registerTestDevice, useTestDb } from '@/lib/api/test-helpers';
import { DELETE as leave } from '../membership/route';
import { DELETE as deleteDevice } from '../../../devices/me/route';
import { makeRequest } from '@/lib/api/test-helpers';

const NOW = Date.UTC(2026, 10, 23, 15);

describe('GET /api/groups/:id/overview', () => {
  const t = useTestDb();
  afterEach(() => vi.useRealTimers());

  async function trio() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const kim = await registerTestDevice('Kim');
    const group = await createTestGroup(sam, SHARING_DEFAULT);
    vi.setSystemTime(NOW + 1);
    await joinTestGroup(alex, group.joinCode, { focusMinutes: true, focusingNow: false });
    vi.setSystemTime(NOW + 2);
    await joinTestGroup(kim, group.joinCode, SHARING_OFF);
    for (const d of [sam, alex, kim]) {
      await sendTotals(d, {
        days: [
          { localDate: '2026-11-22', focusMinutes: 30 },
          { localDate: '2026-11-23', focusMinutes: 50 },
        ],
      });
      await sendPresence(d, 'start');
    }
    return { sam, alex, kim, group };
  }

  it('shows each member only what they share; nothing else', async () => {
    const { kim, group } = await trio();
    const res = await fetchOverview(kim, group.id, '?today=2026-11-23');
    expect(res.status).toBe(200);
    const body = (await res.json()) as GroupOverviewResponse;
    expect(body.group).toEqual({ id: group.id, name: 'Study' });
    expect(body.today).toBe('2026-11-23');
    const history = [0, 0, 0, 0, 0, 30, 50].map((focusMinutes, i) => ({
      localDate: `2026-11-${17 + i}`,
      focusMinutes,
    }));
    expect(body.members).toEqual([
      {
        displayName: 'Sam',
        role: 'owner',
        isMe: false,
        todayMinutes: 50,
        focusingNow: true,
        history,
      },
      {
        displayName: 'Alex',
        role: 'member',
        isMe: false,
        todayMinutes: 50,
        focusingNow: null,
        history,
      },
      // Kim shares nothing: nothing was even stored.
      {
        displayName: 'Kim',
        role: 'member',
        isMe: true,
        todayMinutes: null,
        focusingNow: null,
        history: null,
      },
    ]);
    // No device IDs or anything extra anywhere in the answer.
    const text = JSON.stringify(body);
    for (const leak of ['deviceId', 'device_id', 'token', 'since', 'expires']) {
      expect(text).not.toContain(leak);
    }
  });

  it('"today" is the viewer’s local date (server UTC date when left out)', async () => {
    const { kim, group } = await trio();
    const body = async (q: string) =>
      (await (await fetchOverview(kim, group.id, q)).json()) as GroupOverviewResponse;
    expect((await body('')).today).toBe('2026-11-23');
    const yesterday = await body('?today=2026-11-22');
    expect(yesterday.members[0]?.todayMinutes).toBe(30);
    // More than a day away from the server's date, or not a date: rejected.
    for (const q of [
      '?today=2026-11-25',
      '?today=2026-11-21',
      '?today=tomorrow',
      '?today=2026-13-01',
    ]) {
      expect((await fetchOverview(kim, group.id, q)).status, q).toBe(400);
    }
  });

  it('focusing now goes stale without a heartbeat', async () => {
    const { kim, group } = await trio();
    vi.setSystemTime(NOW + 3 * 60_000 + 10);
    const body = (await (await fetchOverview(kim, group.id)).json()) as GroupOverviewResponse;
    expect(body.members[0]?.focusingNow).toBe(false);
  });

  it('leaving removes the member and their data from the group at once', async () => {
    const { sam, alex, group } = await trio();
    const res = await leave(
      makeRequest('DELETE', `/api/groups/${group.id}/membership`, { headers: sam.headers }),
    );
    expect(res.status).toBe(200);
    const body = (await (await fetchOverview(alex, group.id)).json()) as GroupOverviewResponse;
    expect(body.members.map((m) => m.displayName)).toEqual(['Alex', 'Kim']);
    // The one who left can't see the group any more.
    expect((await fetchOverview(sam, group.id)).status).toBe(404);
  });

  it('deleting server data removes the member everywhere', async () => {
    const { sam, alex, group } = await trio();
    await deleteDevice(makeRequest('DELETE', '/api/devices/me', { headers: sam.headers }));
    const body = (await (await fetchOverview(alex, group.id)).json()) as GroupOverviewResponse;
    expect(body.members.map((m) => m.displayName)).toEqual(['Alex', 'Kim']);
    expect((await fetchOverview(sam, group.id)).status).toBe(401);
  });

  it('404 for non-members and bad ids; 401 without a token', async () => {
    const { group } = await trio();
    const outsider = await registerTestDevice('Out');
    expect((await fetchOverview(outsider, group.id)).status).toBe(404);
    expect((await fetchOverview(outsider, 'abc')).status).toBe(404);
    const { GET } = await import('./route');
    expect((await GET(makeRequest('GET', `/api/groups/${group.id}/overview`))).status).toBe(401);
  });

  it('is rate-limited per device', async () => {
    const { kim, group } = await trio();
    await useUpRateLimit(t(), RATE_LIMITS.groupOverview, kim);
    expect((await fetchOverview(kim, group.id)).status).toBe(429);
  });
});
