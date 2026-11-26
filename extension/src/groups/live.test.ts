import { describe, expect, it, vi } from 'vitest';
import type { LiveSession } from '@studylens/shared';
import { memoryStore } from '../storage/activity-store';
import { STORAGE_KEYS } from '../storage/keys';
import type { FullStore } from '../storage/activity-store';
import type { ApiClient } from './api-client';
import type { GroupSessionInput } from '../sessions/session-controller';
import {
  activeLiveSessions,
  groupSessionInput,
  joinLiveSession,
  startLiveSession,
  syncLiveSession,
  type LiveSyncDeps,
} from './live';

const T0 = Date.UTC(2026, 10, 25, 14);
const MIN = 60_000;
const DEVICE = { deviceId: 'd1', token: 'slt_secret', displayName: 'Sam', registeredAt: 1 };

const fullStore = (initial: Record<string, unknown> = {}): FullStore => memoryStore(initial);

const registered = (extra: Record<string, unknown> = {}) =>
  fullStore({
    [STORAGE_KEYS.groupDevice]: DEVICE,
    [STORAGE_KEYS.groupSharing]: { g1: { focusMinutes: true, focusingNow: true } },
    ...extra,
  });

const live = (over: Partial<LiveSession> = {}): LiveSession => ({
  id: 'live-1',
  groupId: 'g1',
  groupName: 'Chem',
  goal: 'Ch. 4',
  plannedMinutes: 25,
  startedAt: T0 + 5000,
  endsAt: T0 + 5000 + 25 * MIN,
  state: 'running',
  me: 'focusing',
  participants: [],
  roomCode: 'ROOMCODE23456789',
  ...over,
});

/** A fake client: every call is a vi.fn answering as given (the server clock is 5 s ahead). */
function client(over: Partial<Record<keyof ApiClient, unknown>> = {}) {
  const ok = (session = live()) => ({ ok: true, data: { serverNow: T0 + 5000, session } });
  return {
    startLive: vi.fn(async () => ok()),
    joinLive: vi.fn(async () => ok()),
    leaveLive: vi.fn(async () => ok()),
    heartbeatLive: vi.fn(async () => ok()),
    getLive: vi.fn(async () => ok()),
    listLive: vi.fn(async () => ({ ok: true, data: { serverNow: T0 + 5000, sessions: [live()] } })),
    ...over,
  } as unknown as ApiClient & Record<string, ReturnType<typeof vi.fn>>;
}

describe('live group sessions (P18b)', () => {
  it('measures the clock offset and turns the shared end into local time', async () => {
    const c = client();
    const res = await activeLiveSessions({ store: registered(), client: c, now: () => T0 });
    expect(res).toMatchObject({ ok: true, data: { offsetMs: 5000 } });
    const input = groupSessionInput(live(), 5000, false);
    expect(input.plannedEnd).toBe(T0 + 25 * MIN);
    expect(input.link).toEqual({
      sessionId: 'live-1',
      groupId: 'g1',
      groupName: 'Chem',
      isHost: false,
      clockOffsetMs: 5000,
    });
  });

  it('sends nothing when not registered or not in any group', async () => {
    const c = client();
    expect(await activeLiveSessions({ store: fullStore(), client: c })).toBeNull();
    const noGroups = fullStore({ [STORAGE_KEYS.groupDevice]: DEVICE });
    expect(await activeLiveSessions({ store: noGroups, client: c })).toBeNull();
    expect(c.listLive).not.toHaveBeenCalled();
  });

  it('start: sends only the goal (if any) and length, then starts the local session', async () => {
    const c = client();
    const startLocal = vi.fn<(input: GroupSessionInput) => Promise<{ ok: true }>>(async () => ({
      ok: true,
    }));
    const res = await startLiveSession(
      { store: registered(), client: c, now: () => T0, startLocal },
      'g1',
      '  ',
      25,
    );
    expect(res.ok).toBe(true);
    expect(c.startLive).toHaveBeenCalledWith('slt_secret', 'g1', { minutes: 25 });
    expect(startLocal).toHaveBeenCalledWith(
      expect.objectContaining({ plannedEnd: T0 + 25 * MIN, goal: 'Ch. 4' }),
    );
    expect(startLocal.mock.calls[0]![0].link.isHost).toBe(true);
    await startLiveSession(
      { store: registered(), client: c, now: () => T0, startLocal },
      'g1',
      'Read',
      50,
      30,
    );
    // Test seconds only ever leave the E2E build (vitest runs as a normal build).
    expect(c.startLive).toHaveBeenLastCalledWith('slt_secret', 'g1', { minutes: 50, goal: 'Read' });
  });

  it('join: when the local session can’t start, leaves on the server again', async () => {
    const c = client();
    const startLocal = vi.fn(async () => ({ ok: false as const, error: 'already-running' }));
    const res = await joinLiveSession({ store: registered(), client: c, startLocal }, 'live-1');
    expect(res).toEqual({ ok: false, local: 'already-running' });
    expect(c.leaveLive).toHaveBeenCalledWith('slt_secret', 'live-1');
  });

  it('join: a server failure starts nothing locally', async () => {
    const c = client({
      joinLive: vi.fn(async () => ({
        ok: false,
        kind: 'http',
        status: 409,
        code: 'session_over',
        message: 'over',
      })),
    });
    const startLocal = vi.fn();
    const res = await joinLiveSession({ store: registered(), client: c, startLocal }, 'live-1');
    expect(res).toMatchObject({ ok: false, failure: { code: 'session_over' } });
    expect(startLocal).not.toHaveBeenCalled();
  });

  describe('background sync', () => {
    const groupSession = (over: Record<string, unknown> = {}) => ({
      id: 'local-1',
      goal: 'Ch. 4',
      plannedMinutes: 25,
      start: T0,
      plannedEnd: T0 + 25 * MIN,
      condition: 'group',
      mode: 'group',
      group: {
        sessionId: 'live-1',
        groupId: 'g1',
        groupName: 'Chem',
        isHost: false,
        clockOffsetMs: 0,
      },
      ...over,
    });
    function deps(store: FullStore, c = client()): LiveSyncDeps & { c: typeof c } {
      return {
        store,
        client: c,
        now: () => T0 + MIN,
        correctEnd: vi.fn(async () => undefined),
        endEarly: vi.fn(async () => undefined),
        c,
      };
    }

    it('tick: heartbeat, then the end time is corrected with the measured offset', async () => {
      const d = deps(registered({ [STORAGE_KEYS.activeSession]: groupSession() }));
      expect(await syncLiveSession(d, T0 + MIN, 'tick')).toBe('heartbeat-sent');
      expect(d.c.heartbeatLive).toHaveBeenCalledWith('slt_secret', 'live-1');
      // Server clock T0+5s at local T0+1min → offset −55 s; end in local time = end + 55 s.
      expect(d.correctEnd).toHaveBeenCalledWith('live-1', T0 + 5000 + 25 * MIN + 55_000, -55_000);
    });

    it('tick: the server says I left → the local session ends', async () => {
      const c = client({
        heartbeatLive: vi.fn(async () => ({
          ok: true,
          data: { serverNow: T0, session: live({ me: 'left' }) },
        })),
      });
      const d = deps(registered({ [STORAGE_KEYS.activeSession]: groupSession() }), c);
      expect(await syncLiveSession(d, T0 + MIN, 'tick')).toBe('left-elsewhere');
      expect(d.endEarly).toHaveBeenCalled();
    });

    it('tick: nothing for solo sessions or unregistered browsers', async () => {
      const solo = deps(
        registered({
          [STORAGE_KEYS.activeSession]: groupSession({ group: undefined, mode: 'solo' }),
        }),
      );
      expect(await syncLiveSession(solo, T0 + MIN, 'tick')).toBe('nothing');
      expect(solo.c.heartbeatLive).not.toHaveBeenCalled();
      const none = deps(fullStore({ [STORAGE_KEYS.activeSession]: groupSession() }));
      expect(await syncLiveSession(none, T0 + MIN, 'tick')).toBe('nothing');
    });

    it('ending early sends "leave"; offline it is kept and retried on the heartbeat', async () => {
      const finished = {
        ...groupSession(),
        actualEnd: T0 + 10 * MIN,
        endedEarly: true,
        minutesByCategory: { study: 0, neutral: 0, distraction: 0 },
        distractionVisits: 0,
        checkIn: null,
      };
      let online = false;
      const c = client({
        leaveLive: vi.fn(async () =>
          online ? { ok: true, data: {} } : { ok: false, kind: 'offline' },
        ),
      });
      const store = registered({ [STORAGE_KEYS.sessionHistory]: [finished] });
      const d = deps(store, c);
      expect(await syncLiveSession(d, T0 + 10 * MIN, 'session-end')).toBe('leave-waiting');
      const key = STORAGE_KEYS.groupLivePendingLeave;
      expect((await store.get([key]))[key]).toEqual({ sessionId: 'live-1', since: T0 + 10 * MIN });
      online = true;
      expect(await syncLiveSession(d, T0 + 11 * MIN, 'heartbeat')).toBe('leave-sent');
      expect((await store.get([key]))[key]).toBeUndefined();
      expect(await syncLiveSession(d, T0 + 12 * MIN, 'heartbeat')).toBe('nothing');
    });

    it('a group session that reached the shared end sends nothing', async () => {
      const finished = {
        ...groupSession(),
        actualEnd: T0 + 25 * MIN,
        endedEarly: false,
        minutesByCategory: { study: 0, neutral: 0, distraction: 0 },
        distractionVisits: 0,
        checkIn: null,
      };
      const d = deps(registered({ [STORAGE_KEYS.sessionHistory]: [finished] }));
      expect(await syncLiveSession(d, T0 + 25 * MIN, 'session-end')).toBe('nothing');
      expect(d.c.leaveLive).not.toHaveBeenCalled();
    });

    it('drops a pending leave the server refuses (4xx) or after 24 h', async () => {
      const key = STORAGE_KEYS.groupLivePendingLeave;
      const c = client({
        leaveLive: vi.fn(async () => ({
          ok: false,
          kind: 'http',
          status: 404,
          code: 'not_found',
          message: '',
        })),
      });
      const store = registered({ [key]: { sessionId: 'live-1', since: T0 } });
      expect(await syncLiveSession(deps(store, c), T0 + MIN, 'heartbeat')).toBe('leave-dropped');
      const old = registered({ [key]: { sessionId: 'live-1', since: T0 } });
      expect(await syncLiveSession(deps(old), T0 + 25 * 60 * MIN, 'heartbeat')).toBe(
        'leave-dropped',
      );
    });
  });
});
