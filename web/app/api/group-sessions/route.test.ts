/** Live group focus sessions (P18b): every endpoint, through the real routes on a temp database. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SHARING_DEFAULT,
  SHARING_OFF,
  type ActiveLiveSessionsResponse,
  type LiveSessionResponse,
} from '@studylens/shared';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { createTestGroup, joinTestGroup, useUpRateLimit } from '@/lib/api/group-test-helpers';
import { startLiveSchema, testSecondsAllowed } from '@/lib/api/live';
import {
  makeRequest,
  registerTestDevice,
  useTestDb,
  type TestDevice,
} from '@/lib/api/test-helpers';

const NOW = Date.UTC(2026, 10, 25, 15);
const MIN = 60_000;

async function start(device: TestDevice, groupId: string, json: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/groups/[id]/sessions/route');
  return POST(
    makeRequest('POST', `/api/groups/${groupId}/sessions`, { json, headers: device.headers }),
  );
}

async function list(device: TestDevice): Promise<ActiveLiveSessionsResponse> {
  const { GET } = await import('@/app/api/group-sessions/route');
  const res = await GET(makeRequest('GET', '/api/group-sessions', { headers: device.headers }));
  expect(res.status).toBe(200);
  return (await res.json()) as ActiveLiveSessionsResponse;
}

async function state(device: TestDevice, id: string): Promise<Response> {
  const { GET } = await import('@/app/api/group-sessions/[id]/route');
  return GET(makeRequest('GET', `/api/group-sessions/${id}`, { headers: device.headers }));
}

async function act(
  device: TestDevice,
  id: string,
  action: 'join' | 'leave' | 'heartbeat',
): Promise<Response> {
  const route = {
    join: () => import('@/app/api/group-sessions/[id]/join/route'),
    leave: () => import('@/app/api/group-sessions/[id]/leave/route'),
    heartbeat: () => import('@/app/api/group-sessions/[id]/heartbeat/route'),
  }[action];
  const { POST } = await route();
  return POST(
    makeRequest('POST', `/api/group-sessions/${id}/${action}`, { headers: device.headers }),
  );
}

const body = async (res: Response) => (await res.json()) as LiveSessionResponse;
const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('live group sessions API (P18b)', () => {
  const t = useTestDb();
  afterEach(() => vi.useRealTimers());

  /** Sam (owner, shares minutes) and Alex (shares nothing) in one group. */
  async function pair() {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await createTestGroup(sam, SHARING_DEFAULT);
    await joinTestGroup(alex, group.joinCode, SHARING_OFF);
    return { sam, alex, group };
  }

  it('start → 201 with the server clock, the shared end, and me as host', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { sam, group } = await pair();
    const res = await start(sam, group.id, { goal: '  Chapter   4 ', minutes: 25 });
    expect(res.status).toBe(201);
    const { serverNow, session } = await body(res);
    expect(serverNow).toBe(NOW);
    expect(session).toMatchObject({
      groupId: group.id,
      groupName: 'Study',
      goal: 'Chapter 4',
      plannedMinutes: 25,
      startedAt: NOW,
      endsAt: NOW + 25 * MIN,
      state: 'running',
      me: 'focusing',
      participants: [{ displayName: 'Sam', isMe: true, isHost: true, status: 'focusing' }],
    });
    // The goal is optional.
    const { group: other } = { group: await createTestGroup(sam, SHARING_OFF, 'Other') };
    await act(sam, session.id, 'leave');
    const second = await start(sam, other.id, { minutes: 50 });
    expect(second.status).toBe(201);
    expect((await body(second)).session.goal).toBeNull();
  });

  it('validates the body strictly: length, goal, extra fields, test seconds', async () => {
    const { sam, group } = await pair();
    const bad = [
      { minutes: 4 },
      { minutes: 181 },
      { minutes: 25.5 },
      {},
      { minutes: 25, goal: 'x'.repeat(121) },
      { minutes: 25, goal: 'mail me at sam@example.com' },
      { minutes: 25, goal: 'read https://example.com/notes' },
      { minutes: 25, goal: 'a​b' },
      { minutes: 25, site: 'youtube.com' },
      { minutes: 25, testSeconds: 30 }, // only on the local E2E test server
    ];
    for (const json of bad) {
      const res = await start(sam, group.id, json);
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
    expect(await list(sam)).toMatchObject({ sessions: [] });
  });

  it('test seconds only on the local E2E server, never on Vercel or in production', () => {
    expect(testSecondsAllowed({ STUDYLENS_LIVE_TEST_SECONDS: '1', NODE_ENV: 'development' })).toBe(
      true,
    );
    expect(testSecondsAllowed({ NODE_ENV: 'development' })).toBe(false);
    expect(testSecondsAllowed({ STUDYLENS_LIVE_TEST_SECONDS: '1', NODE_ENV: 'production' })).toBe(
      false,
    );
    expect(
      testSecondsAllowed({ STUDYLENS_LIVE_TEST_SECONDS: '1', NODE_ENV: 'test', VERCEL: '1' }),
    ).toBe(false);
    expect(startLiveSchema(true).safeParse({ minutes: 25, testSeconds: 30 }).success).toBe(true);
    expect(startLiveSchema(false).safeParse({ minutes: 25, testSeconds: 30 }).success).toBe(false);
  });

  it('one running session per group (409); not a member (404)', async () => {
    const { sam, alex, group } = await pair();
    expect((await start(sam, group.id, { minutes: 25 })).status).toBe(201);
    const again = await start(alex, group.id, { minutes: 25 });
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe('session_running');
    const kim = await registerTestDevice('Kim');
    expect((await start(kim, group.id, { minutes: 25 })).status).toBe(404);
    expect((await start(kim, 'not-a-uuid', { minutes: 25 })).status).toBe(404);
  });

  it('members see it in the list, join late, and share the same end time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { sam, alex, group } = await pair();
    const { session } = await body(await start(sam, group.id, { goal: 'Ch. 4', minutes: 25 }));

    const seen = await list(alex);
    expect(seen.sessions.map((s) => [s.id, s.me, s.goal])).toEqual([[session.id, null, 'Ch. 4']]);
    const kim = await registerTestDevice('Kim');
    expect((await list(kim)).sessions).toEqual([]);
    expect((await state(kim, session.id)).status).toBe(404);

    vi.setSystemTime(NOW + 10 * MIN);
    const joined = await act(alex, session.id, 'join');
    expect(joined.status).toBe(201);
    const after = await body(joined);
    expect(after.serverNow).toBe(NOW + 10 * MIN);
    expect(after.session.endsAt).toBe(NOW + 25 * MIN);
    expect(after.session.me).toBe('focusing');
    // Reconnecting (after a restart or being offline): 200, same session.
    expect((await act(alex, session.id, 'join')).status).toBe(200);
    expect((await act(alex, session.id, 'heartbeat')).status).toBe(200);
    expect((await act(kim, session.id, 'heartbeat')).status).toBe(404);
  });

  it('leaving early: host leaves, the session keeps running; rejoining is refused', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { sam, alex, group } = await pair();
    const { session } = await body(await start(sam, group.id, { minutes: 25 }));
    vi.setSystemTime(NOW + MIN);
    await act(alex, session.id, 'join');

    vi.setSystemTime(NOW + 10 * MIN);
    const left = await act(sam, session.id, 'leave');
    expect(left.status).toBe(200);
    const view = (await body(left)).session;
    expect(view.state).toBe('running');
    expect(view.me).toBe('left');
    expect(view.participants.map((p) => [p.displayName, p.status, p.focusMinutes])).toEqual([
      ['Sam', 'left', 10],
      ['Alex', 'focusing', null],
    ]);
    expect((await act(sam, session.id, 'leave')).status).toBe(200); // again: no change
    const rejoin = await act(sam, session.id, 'join');
    expect(rejoin.status).toBe(409);
    expect(await errorCode(rejoin)).toBe('session_over');

    // The end: Alex finished; Alex shares no focus minutes in this group → "not shared".
    vi.setSystemTime(NOW + 25 * MIN);
    const end = await body(await state(sam, session.id));
    expect(end.session.state).toBe('ended');
    expect(end.session.participants.map((p) => [p.status, p.focusMinutes])).toEqual([
      ['left', 10],
      ['finished', null],
    ]);
    expect((await list(alex)).sessions).toEqual([]);
    const late = await act(alex, session.id, 'join');
    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('session_over');
  });

  it('never returns device IDs, tokens, sites or check-ins', async () => {
    const { sam, alex, group } = await pair();
    const { session } = await body(await start(sam, group.id, { minutes: 25 }));
    const text = JSON.stringify(await body(await act(alex, session.id, 'join')));
    expect(text).not.toContain(sam.deviceId);
    expect(text).not.toContain(alex.deviceId);
    expect(text).not.toContain('slt_');
    expect(text).not.toMatch(/checkIn|condition|hostname|url/i);
  });

  it('rate-limits starting and heartbeats per device', async () => {
    const { sam, group } = await pair();
    await useUpRateLimit(t(), RATE_LIMITS.startLive, sam);
    const res = await start(sam, group.id, { minutes: 25 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    await useUpRateLimit(t(), RATE_LIMITS.liveHeartbeat, sam);
    expect((await act(sam, crypto.randomUUID(), 'heartbeat')).status).toBe(429);
  });

  it('needs the device token', async () => {
    const { GET } = await import('@/app/api/group-sessions/route');
    expect((await GET(makeRequest('GET', '/api/group-sessions'))).status).toBe(401);
  });
});
