/**
 * Distraction attempts (P13c): logged at the same trigger point in every condition (control
 * included), with the outcome and, for the helper pages, the dwell time.
 */
import { describe, expect, it } from 'vitest';
import type { InterventionId } from '@studylens/shared';
import { memoryStore, type FullStore } from '../storage/activity-store';
import { saveRules } from '../storage/categories-store';
import { BLOCK_KEY, ENABLED_KEY, NOTICE_SEEN_KEY } from '../storage/interventions-store';
import { loadActiveSession, loadSessions } from '../storage/sessions-store';
import { endSessionEarly, startSession, type SessionDeps } from '../sessions/session-controller';
import {
  MAX_ATTEMPT_LOG,
  NO_ATTEMPTS,
  asAttempts,
  attemptFieldsOf,
  dwellSeconds,
  logAttempt,
  meanDwellSeconds,
  resolveAttempt,
  withoutSites,
  type AttemptFields,
} from './attempts';
import { GRACE_MS, decideInterstitial } from './interstitial';
import { checkTab, recordChoice, type InterstitialDeps } from './interstitial-controller';

const T0 = Date.UTC(2026, 10, 23, 15, 0);
const SEC = 1000;
const MIN = 60 * SEC;
const PAGE = 'moz-extension://abc/interstitial.html';
const YT = 'https://www.youtube.com/watch?v=SECRETVIDEO&list=PRIVATELIST';
const REDDIT = 'https://www.reddit.com/r/private/comments/xyz';

describe('attempt helpers', () => {
  it('logs control attempts as visited right away, helper attempts as open', () => {
    const control = logAttempt(NO_ATTEMPTS, 'youtube.com', 'control', T0);
    expect(control).toEqual({
      distractionAttempts: 1,
      attempts: [
        {
          site: 'youtube.com',
          at: T0,
          condition: 'control',
          outcome: 'visited',
          dwellSeconds: null,
        },
      ],
    });
    for (const mode of ['friction', 'intention'] as const) {
      const s = logAttempt(NO_ATTEMPTS, 'youtube.com', mode, T0);
      expect(s.attempts[0]).toMatchObject({ condition: mode, outcome: null, dwellSeconds: null });
    }
  });

  it('records Continue / Back with the dwell time on the latest open attempt for that site', () => {
    let s: AttemptFields = logAttempt(NO_ATTEMPTS, 'youtube.com', 'friction', T0);
    s = logAttempt(s, 'reddit.com', 'friction', T0 + 20 * SEC);
    s = resolveAttempt(s, 'youtube.com', 'continue', T0 + 12_340);
    s = resolveAttempt(s, 'reddit.com', 'back', T0 + 23 * SEC);
    expect(s.attempts.map((a) => [a.site, a.outcome, a.dwellSeconds])).toEqual([
      ['youtube.com', 'continued', 12.3],
      ['reddit.com', 'turned_back', 3],
    ]);
    // A second choice for the same site finds no open attempt: nothing changes.
    expect(resolveAttempt(s, 'youtube.com', 'back', T0 + MIN)).toBe(s);
  });

  it('dwell time is never negative and rounds to 0.1 s', () => {
    expect(dwellSeconds(T0, T0 - 5 * SEC)).toBe(0);
    expect(dwellSeconds(T0, T0 + 10_049)).toBe(10);
    expect(dwellSeconds(T0, T0 + 10_051)).toBe(10.1);
  });

  it('caps the list but keeps counting', () => {
    let s: AttemptFields = NO_ATTEMPTS;
    for (let i = 0; i < MAX_ATTEMPT_LOG + 5; i++)
      s = logAttempt(s, 'youtube.com', 'control', T0 + i);
    expect(s.distractionAttempts).toBe(MAX_ATTEMPT_LOG + 5);
    expect(s.attempts).toHaveLength(MAX_ATTEMPT_LOG);
  });

  it('reads stored attempts safely; sessions from before v0.4.0 have no count', () => {
    expect(attemptFieldsOf({})).toEqual({ distractionAttempts: null, attempts: [] });
    expect(
      asAttempts([
        {
          site: 'youtube.com',
          at: T0,
          condition: 'friction',
          outcome: 'continued',
          dwellSeconds: 4,
        },
        { at: T0, condition: 'opted-out', outcome: 'visited' },
        { at: 'x', condition: 'control' },
        { at: T0, condition: 'intention', outcome: 'weird', dwellSeconds: -1, url: 'https://x' },
        null,
      ]),
    ).toEqual([
      { site: 'youtube.com', at: T0, condition: 'friction', outcome: 'continued', dwellSeconds: 4 },
      { at: T0, condition: 'intention', outcome: null, dwellSeconds: null },
    ]);
  });

  it('retention removes site names; mean dwell ignores attempts without one', () => {
    const list = [
      { site: 'a.com', at: 1, condition: 'friction', outcome: 'continued', dwellSeconds: 10 },
      { site: 'b.com', at: 2, condition: 'friction', outcome: 'turned_back', dwellSeconds: 3.5 },
      { site: 'c.com', at: 3, condition: 'friction', outcome: null, dwellSeconds: null },
    ] as const;
    expect(withoutSites([...list]).every((a) => !('site' in a))).toBe(true);
    expect(meanDwellSeconds([...list])).toBe(6.8);
    expect(meanDwellSeconds([])).toBeNull();
  });
});

describe('the trigger point is the same in every condition', () => {
  const session = (condition: InterventionId) => ({ id: 's1', condition });
  const ctx = (condition: InterventionId) => ({
    session: session(condition),
    paused: false,
    rules: [{ domain: 'youtube.com', category: 'distraction' as const }],
    state: null,
    now: T0,
  });
  const enter = { tabId: 7, hostname: 'www.youtube.com', previousHostname: 'en.wikipedia.org' };

  it('control logs an attempt (with a grace period) where the helpers redirect', () => {
    const control = decideInterstitial(enter, ctx('control'));
    expect(control).toMatchObject({ action: 'attempt', site: 'youtube.com' });
    if (control.action !== 'attempt') return;
    expect(control.state.grace['youtube.com']).toBe(T0 + GRACE_MS);
    for (const mode of ['friction', 'intention'] as const) {
      expect(decideInterstitial(enter, ctx(mode))).toMatchObject({ action: 'redirect', mode });
    }
  });

  it('control logs nothing when the helpers would not appear', () => {
    const c = ctx('control');
    // Staying on the same site, a Study site, paused, and during the grace period.
    expect(decideInterstitial({ ...enter, previousHostname: 'm.youtube.com' }, c).action).toBe(
      'none',
    );
    expect(decideInterstitial({ ...enter, hostname: 'en.wikipedia.org' }, c).action).toBe('none');
    expect(decideInterstitial(enter, { ...c, paused: true }).action).toBe('none');
    const grace = {
      sessionId: 's1',
      grace: { 'youtube.com': T0 + MIN },
      lastRedirect: null,
      back: null,
    };
    expect(decideInterstitial(enter, { ...c, state: grace }).action).toBe('none');
  });

  it('opted-out sessions log no attempts', () => {
    const c = { ...ctx('control'), session: { id: 's1', condition: 'opted-out' as const } };
    expect(decideInterstitial(enter, c).action).toBe('none');
  });
});

async function setup(condition: InterventionId) {
  const store = memoryStore({
    [ENABLED_KEY]: true,
    [NOTICE_SEEN_KEY]: true,
    [BLOCK_KEY]: [condition],
  });
  await saveRules(store, [
    { domain: 'youtube.com', category: 'distraction' },
    { domain: 'reddit.com', category: 'distraction' },
    { domain: 'wikipedia.org', category: 'study' },
  ]);
  const sessionDeps: SessionDeps = {
    store,
    newId: () => 's1',
    random: () => 0,
    effects: {
      scheduleAlarms: async () => {},
      clearAlarms: async () => {},
      setBadge: async () => {},
    },
  };
  const started = await startSession(sessionDeps, 'Finish lab report', 25, T0);
  if (!started.ok) throw new Error(started.error);
  const deps: InterstitialDeps = { store, pageUrl: PAGE };
  return { store, deps, sessionDeps };
}

const active = async (store: FullStore) => {
  const s = await loadActiveSession(store);
  if (!s) throw new Error('no session');
  return s;
};

describe('attempt logging in the background (all three conditions)', () => {
  it('control: logs "visited", the site loads, and the grace period stops repeats', async () => {
    const { store, deps } = await setup('control');
    expect(await checkTab(deps, { tabId: 1, url: YT }, 'en.wikipedia.org', T0 + MIN)).toEqual({
      type: 'none',
    });
    // Leave and come back within 5 minutes: not a new attempt (same as after Continue).
    await checkTab(
      deps,
      { tabId: 1, url: 'https://en.wikipedia.org/' },
      'www.youtube.com',
      T0 + 2 * MIN,
    );
    await checkTab(deps, { tabId: 1, url: YT }, 'en.wikipedia.org', T0 + 3 * MIN);
    // A different distraction site is a new attempt.
    await checkTab(deps, { tabId: 1, url: REDDIT }, 'www.youtube.com', T0 + 4 * MIN);
    // After the grace period, YouTube counts again.
    await checkTab(deps, { tabId: 1, url: YT }, 'www.reddit.com', T0 + MIN + GRACE_MS + SEC);
    const s = await active(store);
    expect(s.distractionAttempts).toBe(3);
    expect(s.attempts.map((a) => [a.site, a.condition, a.outcome, a.dwellSeconds])).toEqual([
      ['youtube.com', 'control', 'visited', null],
      ['reddit.com', 'control', 'visited', null],
      ['youtube.com', 'control', 'visited', null],
    ]);
    // No helper page counts in control.
    expect([s.frictionShown, s.intentionShown]).toEqual([0, 0]);
  });

  it.each(['friction', 'intention'] as const)(
    '%s: logs the attempt when the page opens; Continue / Back set the outcome and dwell time',
    async (mode) => {
      const { store, deps } = await setup(mode);
      await checkTab(deps, { tabId: 1, url: YT }, 'en.wikipedia.org', T0 + MIN);
      expect((await active(store)).attempts).toEqual([
        { site: 'youtube.com', at: T0 + MIN, condition: mode, outcome: null, dwellSeconds: null },
      ]);
      await recordChoice(deps, mode, 'continue', 's1', 'www.youtube.com', 1, T0 + MIN + 11_500);

      await checkTab(deps, { tabId: 2, url: REDDIT }, 'en.wikipedia.org', T0 + 2 * MIN);
      await recordChoice(deps, mode, 'back', 's1', 'www.reddit.com', 2, T0 + 2 * MIN + 4 * SEC);

      const s = await active(store);
      expect(s.distractionAttempts).toBe(2);
      expect(s.attempts.map((a) => [a.site, a.outcome, a.dwellSeconds])).toEqual([
        ['youtube.com', 'continued', 11.5],
        ['reddit.com', 'turned_back', 4],
      ]);
      // Privacy: no URL, path or query reaches storage.
      expect(JSON.stringify(await store.getAll())).not.toMatch(
        /SECRETVIDEO|PRIVATELIST|private|https?:/,
      );
    },
  );

  it('a choice made after the session ended still completes the attempt on the finished session', async () => {
    const { store, deps, sessionDeps } = await setup('intention');
    await checkTab(deps, { tabId: 1, url: YT }, 'en.wikipedia.org', T0 + MIN);
    await endSessionEarly(sessionDeps, T0 + 2 * MIN);
    await recordChoice(
      deps,
      'intention',
      'back',
      's1',
      'www.youtube.com',
      1,
      T0 + 2 * MIN + 5 * SEC,
    );
    const [done] = await loadSessions(store);
    expect(done?.attempts[0]).toMatchObject({ outcome: 'turned_back', dwellSeconds: 65 });
  });

  it('the existing distraction visits measure is still counted', async () => {
    const { store, deps, sessionDeps } = await setup('control');
    await checkTab(deps, { tabId: 1, url: YT }, 'en.wikipedia.org', T0 + MIN);
    const done = await endSessionEarly(sessionDeps, T0 + 2 * MIN);
    expect(done).toHaveProperty('distractionVisits');
    expect(done?.distractionAttempts).toBe(1);
    expect((await loadSessions(store))[0]?.distractionAttempts).toBe(1);
  });
});
