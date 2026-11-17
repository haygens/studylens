/**
 * "Delete everything" must not miss anything. These tests run the real store code through every
 * kind of write the app does and check that each key it leaves behind is in the one key list
 * (keys.ts), and that deleting removes all of it.
 */
import { describe, expect, it } from 'vitest';
import { deleteEverything } from '../my-data/delete-all';
import {
  endSessionEarly,
  reconcileSession,
  startSession,
  submitCheckIn,
  type SessionDeps,
} from '../sessions/session-controller';
import { initialState, step, type TrackerEvent } from '../tracker/tracker';
import {
  appendSegments,
  memoryStore,
  saveTrackerState,
  setTrackingPaused,
  type FullStore,
} from './activity-store';
import { saveRules } from './categories-store';
import { markNoticeSeen, setInterventionsEnabled, setOptedOut } from './interventions-store';
import { STORAGE_KEYS, classifyKey, dayOfKey, keysToDelete } from './keys';

const T0 = Date.UTC(2026, 10, 16, 15, 0);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function deps(store: FullStore) {
  const log: string[] = [];
  let n = 0;
  const d: SessionDeps = {
    store,
    newId: () => `s${++n}`,
    random: () => 0,
    effects: {
      scheduleAlarms: async () => void log.push('schedule'),
      clearAlarms: async () => void log.push('clear'),
      setBadge: async (t) => void log.push(`badge:${t}`),
    },
  };
  return { d, log };
}

/** Uses every write path the extension has. */
async function useEverything(store: FullStore) {
  const { d } = deps(store);
  // Tracking (P2), on two different days.
  const events: [TrackerEvent, number][] = [
    [
      {
        type: 'sync',
        context: {
          hostname: 'en.wikipedia.org',
          windowFocused: true,
          idle: 'active',
          paused: false,
        },
      },
      T0,
    ],
    [{ type: 'tab', hostname: 'youtube.com' }, T0 + MIN],
  ];
  let state = initialState();
  for (const [event, at] of events) {
    const r = step(state, event, at);
    state = r.state;
    await appendSegments(store, r.segments);
  }
  await appendSegments(store, [{ hostname: 'a.com', start: T0 - DAY, end: T0 - DAY + MIN }]);
  await saveTrackerState(store, state);
  await setTrackingPaused(store, false);
  // Labels (P3).
  await saveRules(store, [{ domain: 'youtube.com', category: 'distraction' }]);
  // Research interventions (P8): flag, notice, opt-out setting; sessions use up the block.
  await setInterventionsEnabled(store, true);
  await markNoticeSeen(store);
  await setOptedOut(store, false);
  // Sessions and check-ins (P4, P5): one answered, one ended early, one running.
  await startSession(d, 'First', 25, T0);
  await reconcileSession(d, T0 + 25 * MIN);
  await submitCheckIn(
    d,
    's1',
    { kind: 'answer', goalCompleted: 'yes', focusRating: 5 },
    T0 + 26 * MIN,
  );
  await startSession(d, 'Second', 25, T0 + 30 * MIN);
  await endSessionEarly(d, T0 + 31 * MIN);
  await startSession(d, 'Third', 25, T0 + 32 * MIN);
}

describe('storage key list', () => {
  it('names every key the app writes', async () => {
    const store = memoryStore();
    await useEverything(store);
    const keys = Object.keys(store.data);
    expect(keys.filter((k) => classifyKey(k) === 'unknown')).toEqual([]);
    // Sanity: the scenario really wrote each kind of key.
    const kinds = new Set(keys.map(classifyKey));
    for (const name of Object.keys(STORAGE_KEYS)) expect(kinds).toContain(name);
    expect(keys.filter((k) => classifyKey(k) === 'activityDay')).toHaveLength(2);
  });

  it('classifies keys and days', () => {
    expect(classifyKey('sessions:history')).toBe('sessionHistory');
    expect(classifyKey('activity:2026-11-16')).toBe('activityDay');
    expect(classifyKey('activity:today')).toBe('unknown');
    expect(dayOfKey('activity:2026-11-16')).toBe('2026-11-16');
    expect(dayOfKey('tracker:state')).toBeNull();
  });

  it('deletes every key, including unknown ones; keeps only the pause setting while paused', () => {
    expect(
      keysToDelete({ 'tracker:state': 1, 'old:key': 2, 'tracking:paused': false }).sort(),
    ).toEqual(['old:key', 'tracker:state', 'tracking:paused']);
    expect(keysToDelete({ 'tracker:state': 1, 'tracking:paused': true })).toEqual([
      'tracker:state',
    ]);
    expect(
      keysToDelete({ 'interventions:opted-out': true, 'interventions:block': ['control'] }),
    ).toEqual(['interventions:block']);
    expect(keysToDelete({ 'interventions:opted-out': false })).toEqual(['interventions:opted-out']);
  });
});

describe('deleteEverything', () => {
  it('empties storage, ends the running session without a check-in, clears the badge', async () => {
    const store = memoryStore();
    await useEverything(store);
    expect(store.data[STORAGE_KEYS.activeSession]).toBeTruthy();
    store.data['left:over'] = 'from an old version';

    const { log, d } = deps(store);
    await deleteEverything(store, d.effects);

    expect(store.data).toEqual({});
    expect(log).toEqual(['clear', 'badge:']);
  });

  it('keeps tracking paused if it was paused', async () => {
    const store = memoryStore();
    await useEverything(store);
    await setTrackingPaused(store, true);
    await deleteEverything(store, deps(store).d.effects);
    expect(store.data).toEqual({ 'tracking:paused': true });
  });

  it('keeps research interventions off if they were turned off', async () => {
    const store = memoryStore();
    await useEverything(store);
    await setOptedOut(store, true);
    await deleteEverything(store, deps(store).d.effects);
    expect(store.data).toEqual({ 'interventions:opted-out': true });
  });
});
