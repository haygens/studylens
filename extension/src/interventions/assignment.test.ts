/**
 * The intervention engine wired into real session starts (P8): conditions are assigned when a
 * session starts, stored on it, kept when it ends early, and the block lives in storage so it
 * survives a background restart.
 */
import { INTERVENTION_IDS, type InterventionId } from '@studylens/shared';
import { describe, expect, it } from 'vitest';
import { memoryStore, type FullStore } from '../storage/activity-store';
import {
  BLOCK_KEY,
  ENABLED_KEY,
  INTERVENTIONS_DEFAULT_ENABLED,
  NOTICE_SEEN_KEY,
  OPTED_OUT_KEY,
  loadInterventionSettings,
  loadNoticeState,
  answerNotice,
  shouldShowNotice,
} from '../storage/interventions-store';
import { ACTIVE_SESSION_KEY, loadActiveSession, loadSessions } from '../storage/sessions-store';
import {
  endSessionEarly,
  startSession,
  submitCheckIn,
  type SessionDeps,
} from '../sessions/session-controller';
import { cryptoRandomInt, seededRandomInt, type RandomInt } from './randomize';

const T0 = Date.UTC(2026, 10, 23, 15, 0);
const MIN = 60_000;
let ids = 0;

/** A fresh background script: new deps (and random source) over the same storage. */
function background(store: FullStore, random: RandomInt = cryptoRandomInt): SessionDeps {
  return {
    store,
    random,
    newId: () => `s${++ids}`,
    effects: {
      scheduleAlarms: async () => {},
      clearAlarms: async () => {},
      setBadge: async () => {},
    },
  };
}

/** Starts a session, ends it early and skips the check-in; returns its condition. */
async function runSession(deps: SessionDeps, at: number) {
  const started = await startSession(deps, 'Goal', 25, at);
  if (!started.ok) throw new Error(started.error);
  const done = await endSessionEarly(deps, at + MIN);
  if (!done) throw new Error('not ended');
  await submitCheckIn(deps, done.id, { kind: 'skip' }, at + 2 * MIN);
  return { started: started.session.condition, finished: done.condition };
}

describe('intervention engine in session starts', () => {
  it('is off by default in normal builds: condition null, no block written', async () => {
    expect(INTERVENTIONS_DEFAULT_ENABLED).toBe(false);
    const store = memoryStore();
    expect(await loadInterventionSettings(store)).toEqual({ enabled: false, optedOut: false });
    const r = await runSession(background(store), T0);
    expect(r).toEqual({ started: null, finished: null });
    expect(store.data[BLOCK_KEY]).toBeUndefined();
  });

  it('flag off leaves a stored block untouched', async () => {
    const store = memoryStore({ [ENABLED_KEY]: false, [BLOCK_KEY]: ['friction'] });
    await runSession(background(store), T0);
    expect(store.data[BLOCK_KEY]).toEqual(['friction']);
  });

  it('assigns the condition at start, stores it, and keeps it when ended early', async () => {
    const store = memoryStore({ [ENABLED_KEY]: true, [BLOCK_KEY]: ['intention', 'control'] });
    const deps = background(store);
    const started = await startSession(deps, 'Essay', 25, T0);
    expect(started.ok && started.session.condition).toBe('intention');
    expect((await loadActiveSession(store))?.condition).toBe('intention');
    expect(store.data[BLOCK_KEY]).toEqual(['control']);

    const done = await endSessionEarly(deps, T0 + 3 * MIN);
    expect(done).toMatchObject({ endedEarly: true, condition: 'intention' });
    expect((await loadSessions(store)).at(-1)?.condition).toBe('intention');
  });

  it('a refused start uses up nothing', async () => {
    const store = memoryStore({ [ENABLED_KEY]: true, [BLOCK_KEY]: ['friction', 'control'] });
    const deps = background(store);
    await startSession(deps, 'First', 25, T0);
    expect(await startSession(deps, 'Second', 25, T0 + MIN)).toEqual({
      ok: false,
      error: 'already-running',
    });
    expect(await startSession(deps, '   ', 25, T0 + MIN)).toMatchObject({ ok: false });
    expect(store.data[BLOCK_KEY]).toEqual(['control']);
  });

  it('a block in progress survives a background restart', async () => {
    const store = memoryStore({ [ENABLED_KEY]: true });
    const first = await runSession(background(store, seededRandomInt(9)), T0);
    const left = store.data[BLOCK_KEY] as InterventionId[];
    expect(left).toHaveLength(2);

    // The background script restarts: new deps, new random source, same storage.
    const restarted = background(store, seededRandomInt(12345));
    const second = await runSession(restarted, T0 + 10 * MIN);
    const third = await runSession(restarted, T0 + 20 * MIN);
    expect([second.started, third.started]).toEqual(left);
    expect([first.started, second.started, third.started].sort()).toEqual(
      [...INTERVENTION_IDS].sort(),
    );
  });

  it('300 real session starts are exactly balanced', async () => {
    const store = memoryStore({ [ENABLED_KEY]: true });
    const counts: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      // A new background each time, as if the browser restarted between sessions.
      const { started } = await runSession(background(store), T0 + i * 10 * MIN);
      counts[String(started)] = (counts[String(started)] ?? 0) + 1;
    }
    expect(counts).toEqual({ control: 100, friction: 100, intention: 100 });
  });

  it('opted out: "opted-out", and the block is not used', async () => {
    const store = memoryStore({
      [ENABLED_KEY]: true,
      [OPTED_OUT_KEY]: true,
      [BLOCK_KEY]: ['friction', 'control'],
    });
    expect(await runSession(background(store), T0)).toEqual({
      started: 'opted-out',
      finished: 'opted-out',
    });
    expect(store.data[BLOCK_KEY]).toEqual(['friction', 'control']);
  });

  it('reads a v0.1 active session (no condition field) as condition null', async () => {
    const store = memoryStore({
      [ACTIVE_SESSION_KEY]: {
        id: 'old',
        goal: 'g',
        plannedMinutes: 25,
        start: T0,
        plannedEnd: T0 + 25 * MIN,
      },
    });
    expect((await loadActiveSession(store))?.condition).toBeNull();
    const done = await endSessionEarly(background(store), T0 + MIN);
    expect(done?.condition).toBeNull();
  });
});

describe('one-time notice', () => {
  it('shows only while the feature is on, not seen yet and not opted out', async () => {
    expect(shouldShowNotice(await loadNoticeState(memoryStore()))).toBe(false);
    expect(shouldShowNotice(await loadNoticeState(memoryStore({ [ENABLED_KEY]: true })))).toBe(
      true,
    );
    expect(
      shouldShowNotice(
        await loadNoticeState(memoryStore({ [ENABLED_KEY]: true, [NOTICE_SEEN_KEY]: true })),
      ),
    ).toBe(false);
    expect(
      shouldShowNotice(
        await loadNoticeState(memoryStore({ [ENABLED_KEY]: true, [OPTED_OUT_KEY]: true })),
      ),
    ).toBe(false);
  });

  it('keeps showing until the user answers: "Keep on" stays on, "Turn off" opts out', async () => {
    const keep = memoryStore({ [ENABLED_KEY]: true });
    // Opening the popup only reads: until a button is pressed, it shows again every time.
    expect(shouldShowNotice(await loadNoticeState(keep))).toBe(true);
    expect(shouldShowNotice(await loadNoticeState(keep))).toBe(true);
    await answerNotice(keep, true);
    expect(await loadNoticeState(keep)).toEqual({ enabled: true, optedOut: false, seen: true });
    expect(shouldShowNotice(await loadNoticeState(keep))).toBe(false);

    const off = memoryStore({ [ENABLED_KEY]: true });
    await answerNotice(off, false);
    expect(await loadNoticeState(off)).toEqual({ enabled: true, optedOut: true, seen: true });
    expect(shouldShowNotice(await loadNoticeState(off))).toBe(false);
  });
});
