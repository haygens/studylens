import { describe, expect, it } from 'vitest';
import { SHARING_DEFAULT, SHARING_OFF, type GroupSharing } from '@studylens/shared';
import { createSession, type ActiveSession, type FocusSession } from '../sessions/session';
import { memoryStore } from '../storage/activity-store';
import { STORAGE_KEYS } from '../storage/keys';
import type { ApiClient, ApiFailure, ApiResult } from './api-client';
import { focusMinutesByDate, syncActivity } from './activity-sync';
import { loadSyncState } from './group-store';

const MIN = 60_000;
/** Local noon, 2026-11-24. */
const T = new Date(2026, 10, 24, 12).getTime();
const DEVICE = { deviceId: 'dev-1', token: 'slt_tok', displayName: 'Sam', registeredAt: 0 };
const OFFLINE: ApiFailure = { ok: false, kind: 'offline' };

function active(start: number, minutes = 25): ActiveSession {
  const s = createSession('Essay', minutes, start, 'active');
  if (typeof s === 'string') throw new Error(s);
  return s;
}

function finished(start: number, end: number): FocusSession {
  return {
    ...active(start, 50),
    id: `s-${start}`,
    actualEnd: end,
    endedEarly: end < start + 50 * MIN,
    minutesByCategory: { study: 0, neutral: 0, distraction: 0 },
    distractionVisits: 0,
    checkIn: null,
  };
}

/** Records what would be sent. */
function fakeClient(
  answers: { totals?: () => ApiResult<unknown>; presence?: () => ApiResult<unknown> } = {},
) {
  const calls: { kind: 'totals' | 'presence'; body: unknown }[] = [];
  const client = {
    sendTotals: async (_t: string, days: unknown) => {
      calls.push({ kind: 'totals', body: days });
      return answers.totals?.() ?? { ok: true, data: { ok: true, stored: 1 } };
    },
    sendPresence: async (_t: string, state: string) => {
      calls.push({ kind: 'presence', body: state });
      return answers.presence?.() ?? { ok: true, data: { ok: true, focusing: state !== 'stop' } };
    },
  } as unknown as ApiClient;
  return { client, calls };
}

function setup(opts: {
  registered?: boolean;
  sharing?: GroupSharing | null;
  history?: FocusSession[];
  active?: ActiveSession | null;
}) {
  return memoryStore({
    ...(opts.registered !== false && { [STORAGE_KEYS.groupDevice]: DEVICE }),
    ...(opts.sharing !== null && {
      [STORAGE_KEYS.groupSharing]: { g1: opts.sharing ?? SHARING_DEFAULT },
    }),
    [STORAGE_KEYS.sessionHistory]: opts.history ?? [],
    [STORAGE_KEYS.activeSession]: opts.active ?? null,
  });
}

describe('focusMinutesByDate', () => {
  it('counts finished and running sessions, split at local midnight', () => {
    const lateEvening = new Date(2026, 10, 23, 23, 40).getTime();
    const minutes = focusMinutesByDate(
      [finished(lateEvening, lateEvening + 50 * MIN), finished(T - 3 * 60 * MIN, T - 2 * 60 * MIN)],
      active(T - 10 * MIN - 30_000),
      T,
    );
    expect(minutes.get('2026-11-23')).toBe(20);
    // 30 after midnight + 60 + 10.5 running (rounded down)
    expect(minutes.get('2026-11-24')).toBe(100);
  });

  it('a running session counts only up to now, and never past its planned end', () => {
    expect(focusMinutesByDate([], active(T - 5 * MIN), T).get('2026-11-24')).toBe(5);
    expect(focusMinutesByDate([], active(T - 60 * MIN, 25), T).get('2026-11-24')).toBe(25);
  });
});

describe('syncActivity', () => {
  it('sends nothing for solo users (not registered) or with every switch off', async () => {
    for (const store of [
      setup({ registered: false, active: active(T) }),
      setup({ sharing: null, active: active(T) }),
      setup({ sharing: SHARING_OFF, active: active(T) }),
    ]) {
      const { client, calls } = fakeClient();
      for (const reason of [
        'session-start',
        'tick',
        'session-end',
        'heartbeat',
        'settings',
      ] as const) {
        expect(await syncActivity({ store, client }, T, reason)).toEqual({
          totals: 'not-sent',
          presence: 'not-sent',
        });
      }
      expect(calls).toEqual([]);
    }
  });

  it('session start: presence start, and today’s totals if there are any', async () => {
    const store = setup({ history: [finished(T - 120 * MIN, T - 70 * MIN)], active: active(T) });
    const { client, calls } = fakeClient();
    expect(await syncActivity({ store, client }, T, 'session-start')).toEqual({
      totals: 'sent',
      presence: 'sent',
    });
    expect(calls).toEqual([
      { kind: 'presence', body: 'start' },
      { kind: 'totals', body: [{ localDate: '2026-11-24', focusMinutes: 50 }] },
    ]);
    expect((await loadSyncState(store)).sent).toEqual({ '2026-11-24': 50 });
  });

  it('during a session: a heartbeat every tick, totals at most every 5 minutes', async () => {
    const store = setup({ active: active(T, 50) });
    const { client, calls } = fakeClient();
    await syncActivity({ store, client }, T, 'session-start'); // 0 minutes: no totals yet
    for (let m = 1; m <= 11; m++) await syncActivity({ store, client }, T + m * MIN, 'tick');
    const presence = calls.filter((c) => c.kind === 'presence').map((c) => c.body);
    expect(presence).toEqual(['start', ...Array(11).fill('heartbeat')]);
    const totals = calls.filter((c) => c.kind === 'totals').map((c) => c.body);
    expect(totals).toEqual([
      [{ localDate: '2026-11-24', focusMinutes: 1 }],
      [{ localDate: '2026-11-24', focusMinutes: 6 }],
      [{ localDate: '2026-11-24', focusMinutes: 11 }],
    ]);
  });

  it('session end: presence stop and the final totals right away', async () => {
    const store = setup({ active: active(T, 50) });
    const { client, calls } = fakeClient();
    await syncActivity({ store, client }, T, 'session-start');
    await syncActivity({ store, client }, T + 2 * MIN, 'tick'); // totals: 2
    // The session ends early after 3 minutes.
    await store.set({
      [STORAGE_KEYS.activeSession]: null,
      [STORAGE_KEYS.sessionHistory]: [finished(T, T + 3 * MIN)],
    });
    calls.length = 0;
    await syncActivity({ store, client }, T + 3 * MIN, 'session-end');
    expect(calls).toEqual([
      { kind: 'presence', body: 'stop' },
      { kind: 'totals', body: [{ localDate: '2026-11-24', focusMinutes: 3 }] },
    ]);
    // Afterwards nothing more goes out (no session, nothing unsent).
    calls.length = 0;
    for (let m = 4; m < 30; m++) {
      await syncActivity({ store, client }, T + m * MIN, 'heartbeat');
    }
    expect(calls).toEqual([]);
  });

  it('a session crossing midnight sends both days', async () => {
    const start = new Date(2026, 10, 23, 23, 50).getTime();
    const end = start + 25 * MIN;
    const store = setup({ history: [finished(start, end)] });
    const { client, calls } = fakeClient();
    await syncActivity({ store, client }, end, 'session-end');
    expect(calls).toEqual([
      {
        kind: 'totals',
        body: [
          { localDate: '2026-11-23', focusMinutes: 10 },
          { localDate: '2026-11-24', focusMinutes: 15 },
        ],
      },
    ]);
  });

  it('offline: totals stay unsent and are retried (heartbeat, at most every 5 min)', async () => {
    const store = setup({ history: [finished(T - 30 * MIN, T)] });
    let online = false;
    const { client, calls } = fakeClient({
      totals: () => (online ? { ok: true, data: { ok: true, stored: 1 } } : OFFLINE),
    });
    expect((await syncActivity({ store, client }, T, 'session-end')).totals).toBe('failed');
    await syncActivity({ store, client }, T + 2 * MIN, 'heartbeat'); // too soon
    expect(calls.filter((c) => c.kind === 'totals')).toHaveLength(1);
    online = true;
    expect((await syncActivity({ store, client }, T + 5 * MIN, 'heartbeat')).totals).toBe('sent');
    expect((await loadSyncState(store)).sent).toEqual({ '2026-11-24': 30 });
    // Nothing unsent any more: the heartbeat stays quiet.
    await syncActivity({ store, client }, T + 20 * MIN, 'heartbeat');
    expect(calls.filter((c) => c.kind === 'totals')).toHaveLength(2);
  });

  it('a failed presence start is retried as a start on the next tick', async () => {
    const store = setup({ active: active(T, 50) });
    let online = false;
    const { client, calls } = fakeClient({
      presence: () => (online ? { ok: true, data: { ok: true, focusing: true } } : OFFLINE),
    });
    await syncActivity({ store, client }, T, 'session-start');
    online = true;
    await syncActivity({ store, client }, T + MIN, 'tick');
    await syncActivity({ store, client }, T + 2 * MIN, 'tick');
    expect(calls.filter((c) => c.kind === 'presence').map((c) => c.body)).toEqual([
      'start',
      'start',
      'heartbeat',
    ]);
  });

  it('the always-on heartbeat never sends presence', async () => {
    const store = setup({
      active: active(T, 50),
      sharing: { focusMinutes: false, focusingNow: true },
    });
    const { client, calls } = fakeClient();
    await syncActivity({ store, client }, T + MIN, 'heartbeat');
    expect(calls).toEqual([]);
  });

  it('only what is switched on is sent', async () => {
    const minutesOnly = setup({
      active: active(T - 10 * MIN, 50),
      sharing: { focusMinutes: true, focusingNow: false },
    });
    const a = fakeClient();
    await syncActivity({ store: minutesOnly, client: a.client }, T, 'session-start');
    expect(a.calls.map((c) => c.kind)).toEqual(['totals']);

    const presenceOnly = setup({
      active: active(T - 10 * MIN, 50),
      sharing: { focusMinutes: false, focusingNow: true },
    });
    const b = fakeClient();
    await syncActivity({ store: presenceOnly, client: b.client }, T, 'session-start');
    expect(b.calls.map((c) => c.kind)).toEqual(['presence']);
  });

  it('without permission nothing is recorded as sent, and the next check tries again', async () => {
    const store = setup({ history: [finished(T - 30 * MIN, T)], active: null });
    const denied = fakeClient({ totals: () => ({ ok: false, kind: 'no-activity-consent' }) });
    expect(await syncActivity({ store, client: denied.client }, T, 'session-end')).toEqual({
      totals: 'not-allowed',
      presence: 'not-sent',
    });
    expect(await loadSyncState(store)).toEqual({
      sent: {},
      lastTotalsAttempt: null,
      presenceOn: false,
    });
  });

  it('stored: 0 (no group shares minutes any more) is not resent again and again', async () => {
    const store = setup({ history: [finished(T - 30 * MIN, T)] });
    const { client, calls } = fakeClient({
      totals: () => ({ ok: true, data: { ok: true, stored: 0 } }),
    });
    expect((await syncActivity({ store, client }, T, 'session-end')).totals).toBe('stored-nothing');
    await syncActivity({ store, client }, T + 10 * MIN, 'heartbeat');
    expect(calls).toHaveLength(1);
  });
});
