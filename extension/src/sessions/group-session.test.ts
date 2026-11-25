/** P18b: the local side of live group sessions in the session controller. */
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../storage/activity-store';
import { RULES_KEY } from '../storage/categories-store';
import { BLOCK_KEY, ENABLED_KEY, NOTICE_SEEN_KEY } from '../storage/interventions-store';
import { STORAGE_KEYS } from '../storage/keys';
import { loadActiveSession, loadSessions } from '../storage/sessions-store';
import {
  correctGroupSessionEnd,
  endSessionEarly,
  reconcileSession,
  startGroupSession,
  startSession,
  type GroupSessionInput,
  type SessionDeps,
} from './session-controller';
import type { ActiveSession } from './session';

const T0 = Date.UTC(2026, 10, 25, 14, 0, 0);
const MIN = 60_000;

function setup(initial: Record<string, unknown> = {}) {
  const store = memoryStore({
    [RULES_KEY]: [],
    [ENABLED_KEY]: true,
    [NOTICE_SEEN_KEY]: true,
    ...initial,
  });
  const scheduled: number[] = [];
  let n = 0;
  const deps: SessionDeps = {
    store,
    newId: () => `local-${++n}`,
    random: () => 0,
    effects: {
      async scheduleAlarms(s: ActiveSession) {
        scheduled.push(s.plannedEnd);
      },
      async clearAlarms() {},
      async setBadge() {},
    },
  };
  return { deps, store, scheduled };
}

const input = (over: Partial<GroupSessionInput> = {}): GroupSessionInput => ({
  link: {
    sessionId: 'live-1',
    groupId: 'g1',
    groupName: 'Chem',
    isHost: false,
    clockOffsetMs: 4000,
  },
  goal: 'Chapter 4',
  plannedEnd: T0 + 25 * MIN,
  ...over,
});

describe('group sessions (P18b)', () => {
  it('starts a group session ending at the shared end: mode group, condition group', async () => {
    const { deps, store, scheduled } = setup();
    const res = await startGroupSession(deps, input(), T0 + 5 * MIN);
    expect(res.ok).toBe(true);
    expect(await loadActiveSession(store)).toMatchObject({
      goal: 'Chapter 4',
      start: T0 + 5 * MIN,
      plannedEnd: T0 + 25 * MIN,
      plannedMinutes: 20, // joined 5 minutes late
      mode: 'group',
      condition: 'group',
      sessionNumber: 1,
      group: { sessionId: 'live-1', groupId: 'g1', groupName: 'Chem', clockOffsetMs: 4000 },
    });
    expect(scheduled).toEqual([T0 + 25 * MIN]);
  });

  it('does NOT use a block-randomization slot, so solo conditions stay balanced', async () => {
    const { deps, store } = setup({ [BLOCK_KEY]: ['friction', 'intention'] });
    await startGroupSession(deps, input(), T0);
    expect((await store.get([BLOCK_KEY]))[BLOCK_KEY]).toEqual(['friction', 'intention']);
    await reconcileSession(deps, T0 + 25 * MIN);
    // The next solo session takes the next slot, as if the group session never happened.
    await startSession(deps, 'Solo essay', 25, T0 + 30 * MIN);
    expect(await loadActiveSession(store)).toMatchObject({
      mode: 'solo',
      condition: 'friction',
      sessionNumber: 2,
    });
    expect((await store.get([BLOCK_KEY]))[BLOCK_KEY]).toEqual(['intention']);
  });

  it('needs no answered research notice (no condition is assigned)', async () => {
    const { deps } = setup({ [NOTICE_SEEN_KEY]: false });
    expect((await startGroupSession(deps, input(), T0)).ok).toBe(true);
  });

  it('a goal-less session gets a local placeholder goal', async () => {
    const { deps, store } = setup();
    await startGroupSession(deps, input({ goal: null }), T0);
    expect((await loadActiveSession(store))?.goal).toBe('Group session: Chem');
  });

  it('refuses while another session runs, when the end is (almost) here, or absurd', async () => {
    const { deps } = setup();
    expect(await startGroupSession(deps, input({ plannedEnd: T0 + 4000 }), T0)).toEqual({
      ok: false,
      error: 'session-over',
    });
    expect(await startGroupSession(deps, input({ plannedEnd: T0 + 200 * MIN }), T0)).toEqual({
      ok: false,
      error: 'invalid-group-session',
    });
    await startSession(deps, 'Solo', 25, T0);
    expect(await startGroupSession(deps, input(), T0)).toEqual({
      ok: false,
      error: 'already-running',
    });
  });

  it('ends at the shared time; leaving early keeps the link for the summary', async () => {
    const a = setup();
    await startGroupSession(a.deps, input(), T0);
    await reconcileSession(a.deps, T0 + 26 * MIN);
    expect((await loadSessions(a.store))[0]).toMatchObject({
      actualEnd: T0 + 25 * MIN,
      endedEarly: false,
      mode: 'group',
      group: { sessionId: 'live-1' },
    });
    const b = setup();
    await startGroupSession(b.deps, input(), T0);
    await endSessionEarly(b.deps, T0 + 10 * MIN);
    expect((await loadSessions(b.store))[0]).toMatchObject({
      endedEarly: true,
      actualEnd: T0 + 10 * MIN,
      condition: 'group',
    });
  });

  it('corrects the end time when the server clock says so (more than 2 s off)', async () => {
    const { deps, store, scheduled } = setup();
    await startGroupSession(deps, input(), T0);
    // 1.5 s off: left alone.
    expect(await correctGroupSessionEnd(deps, 'live-1', T0 + 25 * MIN + 1500, 5500, T0)).toBeNull();
    expect((await loadActiveSession(store))?.plannedEnd).toBe(T0 + 25 * MIN);
    // 30 s off: moved, alarms rescheduled, offset remembered.
    await correctGroupSessionEnd(deps, 'live-1', T0 + 25 * MIN - 30_000, 34_000, T0 + MIN);
    expect(await loadActiveSession(store)).toMatchObject({
      plannedEnd: T0 + 25 * MIN - 30_000,
      group: { clockOffsetMs: 34_000 },
    });
    expect(scheduled.at(-1)).toBe(T0 + 25 * MIN - 30_000);
    // Another live session's ID: ignored.
    expect(await correctGroupSessionEnd(deps, 'other', T0 + MIN, 0, T0 + 2 * MIN)).toBeNull();
    // An end that has already passed ends the session now (not early).
    const ended = await correctGroupSessionEnd(deps, 'live-1', T0 + 2 * MIN, 0, T0 + 3 * MIN);
    expect(ended).toMatchObject({ actualEnd: T0 + 2 * MIN, endedEarly: false });
    expect(await loadActiveSession(store)).toBeNull();
  });

  it('a solo session is never corrected', async () => {
    const { deps, store } = setup();
    await startSession(deps, 'Solo', 25, T0);
    expect(await correctGroupSessionEnd(deps, 'live-1', T0 + MIN, 0, T0)).toBeNull();
    expect((await loadActiveSession(store))?.plannedEnd).toBe(T0 + 25 * MIN);
    expect(STORAGE_KEYS.activeSession).toBe('sessions:active');
  });
});
