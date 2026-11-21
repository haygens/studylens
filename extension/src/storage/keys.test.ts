/**
 * "Delete everything" must not miss anything. These tests run the real store code through every
 * kind of write the app does and check that each key it leaves behind is in the one key list
 * (keys.ts), and that deleting removes all of it.
 */
import { describe, expect, it } from 'vitest';
import { checkTab, recordChoice } from '../interventions/interstitial-controller';
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
import { answerNotice, setInterventionsEnabled, setOptedOut } from './interventions-store';
import { runRetention } from '../retention/retention';
import { saveTheme } from './theme-store';
import { installPlan } from '../onboarding/onboarding';
import { applyInstallPlan, dismissThemesHint, finishWelcome } from './onboarding-store';
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
  // Retention (P12): a 40-day-old record becomes a weekly total; the run time is stamped.
  await appendSegments(store, [
    { hostname: 'b.com', start: T0 - 40 * DAY, end: T0 - 40 * DAY + MIN },
  ]);
  await runRetention(store, T0);
  await saveTrackerState(store, state);
  await setTrackingPaused(store, false);
  // Labels (P3).
  await saveRules(store, [{ domain: 'youtube.com', category: 'distraction' }]);
  // Research interventions (P8): flag, notice, opt-out setting; sessions use up the block.
  await setInterventionsEnabled(store, true);
  await answerNotice(store, true);
  await setOptedOut(store, false);
  // Theme (P13b).
  await saveTheme(store, 'ocean');
  // Onboarding (P13b): welcome page and the "New: themes!" hint.
  await applyInstallPlan(store, installPlan('install'));
  await finishWelcome(store);
  await applyInstallPlan(store, installPlan('update', '0.2.0'));
  await dismissThemesHint(store);
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
  // Friction (P9) and intention (P10): each page shown and answered on the running session.
  const interstitial = { store, pageUrl: 'ext://interstitial.html' };
  const running = await store.get([STORAGE_KEYS.activeSession]);
  await store.set({
    [STORAGE_KEYS.activeSession]: {
      ...(running[STORAGE_KEYS.activeSession] as object),
      condition: 'friction',
    },
  });
  await checkTab(
    interstitial,
    { tabId: 1, url: 'https://youtube.com/watch?v=x' },
    null,
    T0 + 33 * MIN,
  );
  await recordChoice(interstitial, 'friction', 'continue', 's3', 'youtube.com', 1, T0 + 33 * MIN);
  const now = await store.get([STORAGE_KEYS.activeSession]);
  await store.set({
    [STORAGE_KEYS.activeSession]: {
      ...(now[STORAGE_KEYS.activeSession] as object),
      condition: 'intention',
    },
  });
  await checkTab(interstitial, { tabId: 2, url: 'https://youtube.com/' }, null, T0 + 34 * MIN);
  await recordChoice(interstitial, 'intention', 'back', 's3', 'youtube.com', 2, T0 + 34 * MIN);
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
