import { describe, expect, it } from 'vitest';
import { STATE_KEY, dayKey, memoryStore } from '../storage/activity-store';
import { RULES_KEY } from '../storage/categories-store';
import { ACTIVE_SESSION_KEY, loadActiveSession, loadSessions } from '../storage/sessions-store';
import { initialState, type Segment, type TrackerState } from '../tracker/tracker';
import {
  endSessionEarly,
  reconcileSession,
  refreshBadge,
  startSession,
  type SessionDeps,
} from './session-controller';
import type { ActiveSession } from './session';

const T0 = Date.UTC(2026, 10, 15, 14, 0, 0);
const MIN = 60_000;

function setup(initial: Record<string, unknown> = {}) {
  const store = memoryStore({
    [RULES_KEY]: [{ domain: 'youtube.com', category: 'distraction' }],
    ...initial,
  });
  const calls: string[] = [];
  let badge = '';
  let n = 0;
  const deps: SessionDeps = {
    store,
    newId: () => `s${++n}`,
    effects: {
      async scheduleAlarms(s: ActiveSession) {
        calls.push(`schedule:${s.plannedEnd}`);
      },
      async clearAlarms() {
        calls.push('clear');
      },
      async setBadge(text) {
        badge = text;
      },
    },
  };
  return {
    deps,
    store,
    calls,
    get badge() {
      return badge;
    },
  };
}

const seg = (hostname: string, a: number, b: number): Segment => ({
  hostname,
  start: T0 + a * MIN,
  end: T0 + b * MIN,
});

describe('session controller', () => {
  it('starts a session, schedules its alarms and shows the minutes on the badge', async () => {
    const t = setup();
    const result = await startSession(t.deps, 'Problem set', 25, T0);
    expect(result.ok).toBe(true);
    expect(await loadActiveSession(t.store)).toMatchObject({
      id: 's1',
      goal: 'Problem set',
      plannedEnd: T0 + 25 * MIN,
    });
    expect(t.calls).toEqual([`schedule:${T0 + 25 * MIN}`]);
    expect(t.badge).toBe('25');

    await refreshBadge(t.deps, T0 + 10 * MIN + 1);
    expect(t.badge).toBe('15');
  });

  it('allows only one session at a time', async () => {
    const t = setup();
    await startSession(t.deps, 'First', 25, T0);
    expect(await startSession(t.deps, 'Second', 50, T0 + MIN)).toEqual({
      ok: false,
      error: 'already-running',
    });
    expect((await loadActiveSession(t.store))?.goal).toBe('First');
  });

  it('rejects an invalid goal or duration without saving anything', async () => {
    const t = setup();
    expect(await startSession(t.deps, '  ', 25, T0)).toEqual({ ok: false, error: 'invalid-goal' });
    expect(await startSession(t.deps, 'Read', 3, T0)).toEqual({
      ok: false,
      error: 'invalid-duration',
    });
    expect(await loadActiveSession(t.store)).toBeNull();
  });

  it('ends early with stats from finished segments and the open segment', async () => {
    const open: TrackerState = {
      ...initialState(),
      open: { hostname: 'youtube.com', start: T0 + 8 * MIN, lastSeen: T0 + 10 * MIN },
    };
    const t = setup({
      [dayKey(T0)]: [seg('docs.google.com', -5, 5), seg('youtube.com', 5, 6)],
      [STATE_KEY]: open,
    });
    await startSession(t.deps, 'Essay', 25, T0);
    const done = await endSessionEarly(t.deps, T0 + 10 * MIN);

    expect(done).toEqual({
      id: 's1',
      goal: 'Essay',
      plannedMinutes: 25,
      start: T0,
      plannedEnd: T0 + 25 * MIN,
      actualEnd: T0 + 10 * MIN,
      endedEarly: true,
      minutesByCategory: { study: 0, neutral: 5, distraction: 3 },
      distractionVisits: 2,
      condition: null,
      checkIn: null,
    });
    expect(await loadSessions(t.store)).toEqual([done]);
    expect(await loadActiveSession(t.store)).toBeNull();
    expect(t.calls.at(-1)).toBe('clear');
    expect(t.badge).toBe('');
  });

  it('on wake-up after the planned end, ends the session at the planned end time', async () => {
    const t = setup({ [dayKey(T0)]: [seg('youtube.com', 20, 30)] });
    await startSession(t.deps, 'Read', 25, T0);
    // Browser was closed; it comes back three hours later.
    const done = await reconcileSession(t.deps, T0 + 180 * MIN);
    expect(done).toMatchObject({
      actualEnd: T0 + 25 * MIN,
      endedEarly: false,
      minutesByCategory: { study: 0, neutral: 0, distraction: 5 },
      distractionVisits: 1,
    });
    expect(await loadActiveSession(t.store)).toBeNull();
    // Running it again is harmless.
    expect(await reconcileSession(t.deps, T0 + 181 * MIN)).toBeNull();
    expect(await loadSessions(t.store)).toHaveLength(1);
  });

  it('on wake-up before the planned end, keeps the session and restores alarms and badge', async () => {
    const active: ActiveSession = {
      id: 'x',
      goal: 'Read',
      plannedMinutes: 50,
      start: T0,
      plannedEnd: T0 + 50 * MIN,
    };
    const t = setup({ [ACTIVE_SESSION_KEY]: active });
    expect(await reconcileSession(t.deps, T0 + 20 * MIN)).toBeNull();
    expect(t.calls).toEqual([`schedule:${T0 + 50 * MIN}`]);
    expect(t.badge).toBe('30');
    expect(await loadActiveSession(t.store)).toEqual(active);
  });

  it('"End early" after the planned end counts as a normal finish', async () => {
    const t = setup();
    await startSession(t.deps, 'Read', 25, T0);
    const done = await endSessionEarly(t.deps, T0 + 26 * MIN);
    expect(done).toMatchObject({ actualEnd: T0 + 25 * MIN, endedEarly: false });
  });

  it('includes a segment stored under the previous day (started before midnight)', async () => {
    const start = new Date(2026, 10, 16, 0, 5).getTime(); // 00:05 local
    const lateNight: Segment = {
      hostname: 'youtube.com',
      start: start - 10 * MIN, // 23:55 the day before
      end: start + 10 * MIN,
    };
    const t = setup({ [dayKey(lateNight.start)]: [lateNight] });
    await startSession(t.deps, 'Late night', 25, start);
    const done = await reconcileSession(t.deps, start + 25 * MIN);
    expect(done?.minutesByCategory.distraction).toBe(10);
  });

  it('does nothing when there is no session', async () => {
    const t = setup();
    expect(await endSessionEarly(t.deps, T0)).toBeNull();
    expect(await reconcileSession(t.deps, T0)).toBeNull();
    expect(t.badge).toBe('');
  });
});
