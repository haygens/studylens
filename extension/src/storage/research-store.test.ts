import { describe, expect, it } from 'vitest';
import {
  endSessionEarly,
  startSession,
  submitCheckIn,
  type SessionDeps,
} from '../sessions/session-controller';
import { NO_COUNTS } from '../interventions/interstitial';
import {
  HELPER_MIN_SECONDS,
  FRICTION_COUNTDOWN_SECONDS,
  INTENTION_MIN_SECONDS,
  intentionCanContinue,
  intentionHint,
} from '../interventions/interstitial';
import { memoryStore, type FullStore } from './activity-store';
import { RULES_KEY, loadRules, saveRules } from './categories-store';
import { ENABLED_KEY } from './interventions-store';
import {
  LABEL_LOCK_KEY,
  LABEL_VERSION_KEY,
  PARTICIPANT_ID_KEY,
  SESSION_COUNTER_KEY,
  asLabelLock,
  asParticipantId,
  ensureParticipantId,
  loadLabelLock,
  loadLabelSetVersion,
  nextSessionNumber,
  randomParticipantId,
  setLabelLock,
} from './research-store';
import { SESSION_HISTORY_KEY, loadActiveSession, loadSessions } from './sessions-store';

const T0 = Date.UTC(2026, 10, 23, 15, 0);
const MIN = 60_000;

function deps(store: FullStore): SessionDeps {
  let n = 0;
  return {
    store,
    newId: () => `s${++n}`,
    random: () => 0,
    effects: {
      scheduleAlarms: async () => {},
      clearAlarms: async () => {},
      setBadge: async () => {},
    },
  };
}

async function runSession(d: SessionDeps, at: number) {
  const started = await startSession(d, 'Goal', 25, at);
  if (!started.ok) throw new Error(started.error);
  await endSessionEarly(d, at + MIN);
  await submitCheckIn(d, started.session.id, { kind: 'skip' }, at + 2 * MIN);
  return started.session;
}

describe('equal time cost: intention needs 3+ characters AND 10 seconds', () => {
  it('uses the same 10-second constant as friction', () => {
    expect(HELPER_MIN_SECONDS).toBe(10);
    expect(INTENTION_MIN_SECONDS).toBe(FRICTION_COUNTDOWN_SECONDS);
  });

  it.each([
    ['', 10, false],
    ['', 0, false],
    ['ab', 0, false],
    ['  a b  ', 0, false],
    ['abc', 10, false],
    ['abc', 1, false],
    ['abc', 0, true],
    ['a b c', 0, true],
  ])('text %j with %i s left → %s', (text, left, ok) => {
    expect(intentionCanContinue(text, left)).toBe(ok);
  });

  it('the hint says what is still missing', () => {
    expect(intentionHint(false, 7)).toBe(
      'Type a few words (at least 3 letters). You can continue in 7 seconds.',
    );
    expect(intentionHint(true, 1)).toBe('You can continue in 1 second.');
    expect(intentionHint(false, 0)).toBe('Type a few words (at least 3 letters) to continue.');
  });
});

describe('session order and mode', () => {
  it('numbers sessions 1, 2, 3 on this device and marks them solo', async () => {
    const store = memoryStore({ [ENABLED_KEY]: false });
    const d = deps(store);
    for (let i = 0; i < 3; i++) await runSession(d, T0 + i * 10 * MIN);
    const history = await loadSessions(store);
    expect(history.map((s) => s.sessionNumber)).toEqual([1, 2, 3]);
    expect(history.every((s) => s.mode === 'solo')).toBe(true);
    expect((await store.get([SESSION_COUNTER_KEY]))[SESSION_COUNTER_KEY]).toBe(3);
  });

  it('the running session already has its number', async () => {
    const store = memoryStore({ [ENABLED_KEY]: false, [SESSION_COUNTER_KEY]: 41 });
    await startSession(deps(store), 'Goal', 25, T0);
    expect((await loadActiveSession(store))?.sessionNumber).toBe(42);
  });

  it('after updating from v0.3.0, numbering continues after the sessions in history', async () => {
    const old = {
      id: 'old',
      goal: 'g',
      plannedMinutes: 25,
      start: T0 - 60 * MIN,
      plannedEnd: T0 - 35 * MIN,
      actualEnd: T0 - 35 * MIN,
      endedEarly: false,
      condition: 'control',
      minutesByCategory: { study: 1, neutral: 0, distraction: 0 },
      distractionVisits: 0,
      checkIn: null,
      ...NO_COUNTS,
    };
    const store = memoryStore({
      [ENABLED_KEY]: false,
      [SESSION_HISTORY_KEY]: [old, { ...old, id: 'old2' }],
    });
    await runSession(deps(store), T0);
    const history = await loadSessions(store);
    // Old sessions: solo, no number / attempts / label version (they were not logged).
    expect(history[0]).toMatchObject({
      mode: 'solo',
      sessionNumber: null,
      distractionAttempts: null,
      labelSetVersion: null,
    });
    expect(history[2]?.sessionNumber).toBe(3);
    expect(nextSessionNumber(undefined, 2)).toBe(3);
    expect(nextSessionNumber(7, 2)).toBe(8);
    expect(nextSessionNumber('7', 0)).toBe(1);
  });
});

describe('study mode (label lock) and label-set version', () => {
  it('records every switch with its time and ignores a switch to the same state', async () => {
    const store = memoryStore();
    expect(await loadLabelLock(store)).toEqual({ locked: false, changes: [] });
    await setLabelLock(store, true, T0);
    await setLabelLock(store, true, T0 + MIN);
    await setLabelLock(store, false, T0 + 2 * MIN);
    expect(await loadLabelLock(store)).toEqual({
      locked: false,
      changes: [
        { locked: true, at: T0 },
        { locked: false, at: T0 + 2 * MIN },
      ],
    });
    expect(asLabelLock({ locked: 'yes', changes: [{ locked: true }, 5] })).toEqual({
      locked: false,
      changes: [],
    });
  });

  it('labels cannot be saved while locked; the version goes up only on a real change', async () => {
    const store = memoryStore();
    expect(await loadLabelSetVersion(store)).toBe(1);
    const yt = { domain: 'youtube.com', category: 'distraction' } as const;
    expect(await saveRules(store, [yt])).toBe('saved');
    expect(await loadLabelSetVersion(store)).toBe(2);
    expect(await saveRules(store, [yt])).toBe('unchanged');
    expect(await loadLabelSetVersion(store)).toBe(2);

    await setLabelLock(store, true, T0);
    expect(await saveRules(store, [])).toBe('locked');
    expect(await loadRules(store)).toEqual([yt]);
    expect(await loadLabelSetVersion(store)).toBe(2);

    await setLabelLock(store, false, T0 + MIN);
    expect(await saveRules(store, [{ ...yt, category: 'neutral' }])).toBe('saved');
    expect(await loadLabelSetVersion(store)).toBe(3);
  });

  it('each session stores the label-set version and whether labels were locked', async () => {
    const store = memoryStore({
      [ENABLED_KEY]: false,
      [RULES_KEY]: [{ domain: 'youtube.com', category: 'distraction' }],
      [LABEL_VERSION_KEY]: 5,
    });
    const d = deps(store);
    await runSession(d, T0);
    await setLabelLock(store, true, T0 + 5 * MIN);
    await runSession(d, T0 + 10 * MIN);
    const [a, b] = await loadSessions(store);
    expect([a?.labelSetVersion, a?.labelsLocked]).toEqual([5, false]);
    expect([b?.labelSetVersion, b?.labelsLocked]).toEqual([5, true]);
    expect((await store.get([LABEL_LOCK_KEY]))[LABEL_LOCK_KEY]).toMatchObject({ locked: true });
  });
});

describe('participant ID', () => {
  it('is random, made once, and kept', async () => {
    const store = memoryStore();
    const id = await ensureParticipantId(store, randomParticipantId);
    expect(id).toMatch(/^p-[0-9a-f]{12}$/);
    expect(await ensureParticipantId(store, () => 'p-other-id-000')).toBe(id);
    expect((await store.get([PARTICIPANT_ID_KEY]))[PARTICIPANT_ID_KEY]).toBe(id);
    expect(randomParticipantId()).not.toBe(randomParticipantId());
  });

  it('replaces a malformed stored value', async () => {
    const store = memoryStore({ [PARTICIPANT_ID_KEY]: 'x y' });
    expect(await ensureParticipantId(store, () => 'p-aaaaaaaaaaaa')).toBe('p-aaaaaaaaaaaa');
    expect(asParticipantId(42)).toBeNull();
  });
});
