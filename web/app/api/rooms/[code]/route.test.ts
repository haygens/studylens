/** P18c: the public room lookup behind /s/<code>. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROOM_CODE_LENGTH,
  SHARING_DEFAULT,
  type LiveRoomResponse,
  type LiveSessionResponse,
} from '@studylens/shared';
import { resetClientRateLimits } from '@/lib/api/client-limit';
import { createTestGroup, joinTestGroup } from '@/lib/api/group-test-helpers';
import { CLIENT_RATE_LIMITS } from '@/lib/api/rate-limit';
import { makeRequest, registerTestDevice, useTestDb } from '@/lib/api/test-helpers';

const NOW = Date.UTC(2026, 10, 26, 18);
const MIN = 60_000;

async function room(code: string, ip = '198.51.100.7'): Promise<Response> {
  const { GET } = await import('@/app/api/rooms/[code]/route');
  return GET(makeRequest('GET', `/api/rooms/${code}`, { headers: { 'x-forwarded-for': ip } }));
}

describe('GET /api/rooms/:code (P18c)', () => {
  useTestDb();
  beforeEach(() => resetClientRateLimits());
  afterEach(() => vi.useRealTimers());

  async function liveSession() {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await createTestGroup(sam, SHARING_DEFAULT, 'Chem');
    await joinTestGroup(alex, group.joinCode, SHARING_DEFAULT);
    const { POST } = await import('@/app/api/groups/[id]/sessions/route');
    const res = await POST(
      makeRequest('POST', `/api/groups/${group.id}/sessions`, {
        json: { goal: 'Ch. 4', minutes: 25 },
        headers: sam.headers,
      }),
    );
    expect(res.status).toBe(201);
    const { session } = (await res.json()) as LiveSessionResponse;
    return { sam, alex, session };
  }

  it('each new live session gets a long random room code (members see it)', async () => {
    const { session } = await liveSession();
    expect(session.roomCode).toMatch(new RegExp(`^[A-Z2-9]{${ROOM_CODE_LENGTH}}$`));
    const other = await liveSession();
    expect(other.session.roomCode).not.toBe(session.roomCode);
  });

  it('anyone with the link sees the timer, group, goal, names and statuses — nothing more', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { sam, alex, session } = await liveSession();
    const res = await room(session.roomCode!);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as LiveRoomResponse;
    expect(body).toEqual({
      serverNow: NOW,
      room: {
        groupName: 'Chem',
        goal: 'Ch. 4',
        plannedMinutes: 25,
        startedAt: NOW,
        endsAt: NOW + 25 * MIN,
        state: 'running',
        participants: [
          {
            displayName: 'Sam',
            isHost: true,
            status: 'focusing',
            recentlySeen: true,
            lastSeenMinutesAgo: null,
          },
        ],
      },
    });
    const text = JSON.stringify(body);
    for (const secret of [sam.deviceId, alex.deviceId, sam.token, session.id, session.groupId]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/focusMinutes|isMe|joinCode/);
  });

  it('unknown, malformed and expired codes all get the same 404', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { session } = await liveSession();
    const messages = new Set<string>();
    for (const code of ['ZZZZZZZZZZZZZZZZ', 'short', session.roomCode!.toLowerCase()]) {
      const res = await room(code);
      expect(res.status).toBe(404);
      messages.add(((await res.json()) as { error: { message: string } }).error.message);
    }
    // Still there 59 minutes after the end, gone at 60.
    vi.setSystemTime(NOW + 25 * MIN + 59 * MIN);
    expect((await room(session.roomCode!)).status).toBe(200);
    vi.setSystemTime(NOW + 25 * MIN + 60 * MIN);
    const expired = await room(session.roomCode!);
    expect(expired.status).toBe(404);
    messages.add(((await expired.json()) as { error: { message: string } }).error.message);
    expect(messages.size).toBe(1);
  });

  it('is rate-limited per client address (in memory)', async () => {
    const limit = CLIENT_RATE_LIMITS.roomLookup.limit;
    for (let i = 0; i < limit; i++) await room('x', '203.0.113.50');
    const blocked = await room('x', '203.0.113.50');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    // Another address is not affected.
    expect((await room('x', '203.0.113.51')).status).toBe(404);
  });
});
