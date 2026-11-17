import { describe, expect, it } from 'vitest';
import type { InterventionId } from '@studylens/shared';
import { memoryStore, setTrackingPaused, type FullStore } from '../storage/activity-store';
import { saveRules } from '../storage/categories-store';
import { FRICTION_STATE_KEY, loadFrictionState } from '../storage/friction-store';
import { BLOCK_KEY, ENABLED_KEY } from '../storage/interventions-store';
import { loadActiveSession, loadSessions } from '../storage/sessions-store';
import { endSessionEarly, startSession, type SessionDeps } from '../sessions/session-controller';
import { FRICTION_GRACE_MS, NO_FRICTION, parseFrictionPage } from './friction';
import { checkTab, recordFrictionChoice, type FrictionDeps } from './friction-controller';

const T0 = Date.UTC(2026, 10, 23, 15, 0);
const MIN = 60_000;
const PAGE = 'moz-extension://abc/friction.html';
const YT = 'https://www.youtube.com/watch?v=SECRETVIDEO&list=PRIVATELIST#t=42';

async function setup(condition: InterventionId = 'friction') {
  const store = memoryStore({ [ENABLED_KEY]: true, [BLOCK_KEY]: [condition] });
  await saveRules(store, [
    { domain: 'youtube.com', category: 'distraction' },
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
  expect(started.session.condition).toBe(condition);
  const deps: FrictionDeps = { store, pageUrl: PAGE };
  return { store, deps, sessionDeps };
}

const counts = async (store: FullStore) => {
  const s = await loadActiveSession(store);
  return (
    s && { shown: s.frictionShown, continued: s.frictionContinued, back: s.frictionTurnedBack }
  );
};

describe('checkTab', () => {
  it('redirects a Distraction site to the countdown page and counts it as shown', async () => {
    const { store, deps } = await setup();
    const action = await checkTab(deps, { tabId: 3, url: YT }, 'en.wikipedia.org', T0 + MIN);
    expect(action.type).toBe('redirect');
    if (action.type !== 'redirect') return;
    expect(parseFrictionPage(new URL(action.url).search)).toEqual({
      mode: 'countdown',
      target: YT,
      hostname: 'youtube.com',
      sessionId: 's1',
    });
    expect(await counts(store)).toEqual({ shown: 1, continued: 0, back: 0 });
  });

  it('leaves Study sites, control sessions and paused tracking alone', async () => {
    const study = await setup();
    expect(
      await checkTab(study.deps, { tabId: 3, url: 'https://en.wikipedia.org/wiki/X' }, null, T0),
    ).toEqual({ type: 'none' });

    const control = await setup('control');
    expect(await checkTab(control.deps, { tabId: 3, url: YT }, null, T0)).toEqual({ type: 'none' });
    expect(await counts(control.store)).toEqual({ shown: 0, continued: 0, back: 0 });

    const paused = await setup();
    await setTrackingPaused(paused.store, true);
    expect(await checkTab(paused.deps, { tabId: 3, url: YT }, null, T0)).toEqual({ type: 'none' });
  });

  it('never targets the countdown page itself, extension pages or browser pages', async () => {
    const { deps, store } = await setup();
    const own = `${PAGE}?to=${encodeURIComponent(YT)}&s=s1`;
    for (const url of [own, 'about:blank', 'edge://settings', 'chrome://newtab', undefined]) {
      expect(await checkTab(deps, { tabId: 3, url }, null, T0)).toEqual({ type: 'none' });
    }
    expect(await counts(store)).toEqual({ shown: 0, continued: 0, back: 0 });
  });
});

describe('recordFrictionChoice', () => {
  it('Continue counts and starts a 5-minute grace period for the site', async () => {
    const { store, deps } = await setup();
    await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN);
    await recordFrictionChoice(deps, 'continue', 's1', 'youtube.com', 3, T0 + MIN + 10_000);
    expect(await counts(store)).toEqual({ shown: 1, continued: 1, back: 0 });

    // Arriving at the site after Continue, and coming back to it later, shows nothing.
    const at = (now: number, prev: string | null = null) =>
      checkTab(deps, { tabId: 3, url: 'https://m.youtube.com/' }, prev, now);
    expect(await at(T0 + MIN + 11_000)).toEqual({ type: 'none' });
    expect(await at(T0 + 3 * MIN, 'en.wikipedia.org')).toEqual({ type: 'none' });
    expect((await at(T0 + MIN + 10_000 + FRICTION_GRACE_MS, 'en.wikipedia.org')).type).toBe(
      'redirect',
    );
    expect(await counts(store)).toEqual({ shown: 2, continued: 1, back: 0 });
  });

  it('Back to studying counts, and going back through the site goes back again', async () => {
    const { store, deps } = await setup();
    await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN);
    await recordFrictionChoice(deps, 'back', 's1', 'youtube.com', 3, T0 + MIN + 2000);
    expect(await counts(store)).toEqual({ shown: 1, continued: 0, back: 1 });
    const action = await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN + 2500);
    expect(action).toEqual({ type: 'go-back', fallbackUrl: `${PAGE}?done=1&s=s1` });
    expect(await counts(store)).toEqual({ shown: 1, continued: 0, back: 1 });
  });

  it('if the session ended during the countdown, Continue is counted on the finished session', async () => {
    const { store, deps, sessionDeps } = await setup();
    await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN);
    await endSessionEarly(sessionDeps, T0 + MIN + 5000);
    await recordFrictionChoice(deps, 'continue', 's1', 'youtube.com', 3, T0 + MIN + 10_000);

    const [done] = await loadSessions(store);
    expect(done?.frictionShown).toBe(1);
    expect(done?.frictionContinued).toBe(1);
    // No session now, so arriving at the site shows nothing.
    expect(await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN + 11_000)).toEqual({
      type: 'none',
    });
  });

  it('a choice for an unknown session changes no counts', async () => {
    const { store, deps } = await setup();
    await recordFrictionChoice(deps, 'continue', 'nope', 'youtube.com', 3, T0);
    expect(await counts(store)).toEqual({ shown: 0, continued: 0, back: 0 });
    // And it never wipes the running session's state.
    expect((await loadFrictionState(store))?.sessionId ?? 's1').toBe('s1');
  });

  it('new sessions start with all counts at 0', async () => {
    const { store } = await setup('control');
    const s = await loadActiveSession(store);
    expect(s && { s: s.frictionShown, c: s.frictionContinued, b: s.frictionTurnedBack }).toEqual({
      s: NO_FRICTION.frictionShown,
      c: NO_FRICTION.frictionContinued,
      b: NO_FRICTION.frictionTurnedBack,
    });
  });
});

describe('privacy: no full URL is ever stored', () => {
  it('after every friction path, storage holds only hostnames and counts', async () => {
    const { store, deps, sessionDeps } = await setup();
    const urls = [
      YT,
      'https://youtube.com/results?search_query=my+secret+search',
      'http://m.youtube.com/shorts/ABCDEF?feature=share',
    ];
    let now = T0 + MIN;
    for (const [i, url] of urls.entries()) {
      now += MIN;
      const action = await checkTab(deps, { tabId: i, url }, 'en.wikipedia.org', now);
      expect(action.type).toBe('redirect');
      await recordFrictionChoice(deps, i === 1 ? 'back' : 'continue', 's1', 'youtube.com', i, now);
      await checkTab(deps, { tabId: i, url }, null, now + 1000);
      now += FRICTION_GRACE_MS;
    }
    await endSessionEarly(sessionDeps, now);

    const dump = JSON.stringify(store.data);
    for (const secret of [
      'SECRETVIDEO',
      'PRIVATELIST',
      'watch',
      'search_query',
      'secret',
      'shorts',
      'ABCDEF',
      'http:',
      'https:',
      '://',
      '?',
      '#',
    ]) {
      expect(dump).not.toContain(secret);
    }
    expect(store.data[FRICTION_STATE_KEY]).toBeTruthy();
    const [done] = await loadSessions(store);
    expect(done).toMatchObject({ frictionShown: 3, frictionContinued: 2, frictionTurnedBack: 1 });
  });
});
