import { describe, expect, it } from 'vitest';
import type { InterventionId } from '@studylens/shared';
import { memoryStore, setTrackingPaused, type FullStore } from '../storage/activity-store';
import { saveRules } from '../storage/categories-store';
import { INTERSTITIAL_STATE_KEY, loadInterstitialState } from '../storage/interstitial-store';
import { BLOCK_KEY, ENABLED_KEY, NOTICE_SEEN_KEY } from '../storage/interventions-store';
import { loadActiveSession, loadSessions } from '../storage/sessions-store';
import { endSessionEarly, startSession, type SessionDeps } from '../sessions/session-controller';
import {
  GRACE_MS,
  NO_COUNTS,
  choiceMessage,
  intentionReady,
  parseInterstitialPage,
  type InterstitialMode,
} from './interstitial';
import { checkTab, recordChoice, type InterstitialDeps } from './interstitial-controller';

const T0 = Date.UTC(2026, 10, 23, 15, 0);
const MIN = 60_000;
const PAGE = 'moz-extension://abc/interstitial.html';
const YT = 'https://www.youtube.com/watch?v=SECRETVIDEO&list=PRIVATELIST#t=42';

async function setup(condition: InterventionId = 'friction') {
  const store = memoryStore({
    [ENABLED_KEY]: true,
    [NOTICE_SEEN_KEY]: true,
    [BLOCK_KEY]: [condition],
  });
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
  const deps: InterstitialDeps = { store, pageUrl: PAGE };
  return { store, deps, sessionDeps };
}

const counts = async (store: FullStore, mode: InterstitialMode = 'friction') => {
  const s = await loadActiveSession(store);
  if (!s) return null;
  return mode === 'friction'
    ? { shown: s.frictionShown, continued: s.frictionContinued, back: s.frictionTurnedBack }
    : { shown: s.intentionShown, continued: s.intentionContinued, back: s.intentionTurnedBack };
};
const ZERO = { shown: 0, continued: 0, back: 0 };

describe('checkTab', () => {
  it.each(['friction', 'intention'] as const)(
    'redirects a Distraction site to the %s page and counts it as shown',
    async (mode) => {
      const { store, deps } = await setup(mode);
      const action = await checkTab(deps, { tabId: 3, url: YT }, 'en.wikipedia.org', T0 + MIN);
      expect(action.type).toBe('redirect');
      if (action.type !== 'redirect') return;
      expect(parseInterstitialPage(new URL(action.url).search)).toEqual({
        kind: 'prompt',
        mode,
        target: YT,
        hostname: 'youtube.com',
        sessionId: 's1',
      });
      expect(await counts(store, mode)).toEqual({ shown: 1, continued: 0, back: 0 });
      // The other mode's counts stay at 0.
      expect(await counts(store, mode === 'friction' ? 'intention' : 'friction')).toEqual(ZERO);
    },
  );

  it('leaves Study sites, control sessions and paused tracking alone', async () => {
    for (const mode of ['friction', 'intention'] as const) {
      const study = await setup(mode);
      expect(
        await checkTab(study.deps, { tabId: 3, url: 'https://en.wikipedia.org/wiki/X' }, null, T0),
      ).toEqual({ type: 'none' });

      const paused = await setup(mode);
      await setTrackingPaused(paused.store, true);
      expect(await checkTab(paused.deps, { tabId: 3, url: YT }, null, T0)).toEqual({
        type: 'none',
      });
    }

    const control = await setup('control');
    expect(await checkTab(control.deps, { tabId: 3, url: YT }, null, T0)).toEqual({ type: 'none' });
    expect(await counts(control.store, 'friction')).toEqual(ZERO);
    expect(await counts(control.store, 'intention')).toEqual(ZERO);
  });

  it('never targets the interstitial page itself, extension pages or browser pages', async () => {
    const { deps, store } = await setup('intention');
    const own = `${PAGE}?m=intention&to=${encodeURIComponent(YT)}&s=s1`;
    for (const url of [own, 'about:blank', 'edge://settings', 'chrome://newtab', undefined]) {
      expect(await checkTab(deps, { tabId: 3, url }, null, T0)).toEqual({ type: 'none' });
    }
    expect(await counts(store, 'intention')).toEqual(ZERO);
  });
});

describe('recordChoice', () => {
  it.each(['friction', 'intention'] as const)(
    'Continue counts and starts a 5-minute grace period for the site (%s)',
    async (mode) => {
      const { store, deps } = await setup(mode);
      await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN);
      await recordChoice(deps, mode, 'continue', 's1', 'youtube.com', 3, T0 + MIN + 10_000);
      expect(await counts(store, mode)).toEqual({ shown: 1, continued: 1, back: 0 });

      // Arriving at the site after Continue, and coming back to it later, shows nothing.
      const at = (now: number, prev: string | null = null) =>
        checkTab(deps, { tabId: 3, url: 'https://m.youtube.com/' }, prev, now);
      expect(await at(T0 + MIN + 11_000)).toEqual({ type: 'none' });
      expect(await at(T0 + 3 * MIN, 'en.wikipedia.org')).toEqual({ type: 'none' });
      expect((await at(T0 + MIN + 10_000 + GRACE_MS, 'en.wikipedia.org')).type).toBe('redirect');
      expect(await counts(store, mode)).toEqual({ shown: 2, continued: 1, back: 0 });
    },
  );

  it.each(['friction', 'intention'] as const)(
    'Back to studying counts, and going back through the site goes back again (%s)',
    async (mode) => {
      const { store, deps } = await setup(mode);
      await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN);
      await recordChoice(deps, mode, 'back', 's1', 'youtube.com', 3, T0 + MIN + 2000);
      expect(await counts(store, mode)).toEqual({ shown: 1, continued: 0, back: 1 });
      const action = await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN + 2500);
      expect(action).toEqual({ type: 'go-back', fallbackUrl: `${PAGE}?done=1&s=s1` });
      expect(await counts(store, mode)).toEqual({ shown: 1, continued: 0, back: 1 });
    },
  );

  it('if the session ended while the page was open, Continue is counted on the finished session', async () => {
    const { store, deps, sessionDeps } = await setup('intention');
    await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN);
    await endSessionEarly(sessionDeps, T0 + MIN + 5000);
    await recordChoice(deps, 'intention', 'continue', 's1', 'youtube.com', 3, T0 + MIN + 10_000);

    const [done] = await loadSessions(store);
    expect(done?.intentionShown).toBe(1);
    expect(done?.intentionContinued).toBe(1);
    // No session now, so arriving at the site shows nothing.
    expect(await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN + 11_000)).toEqual({
      type: 'none',
    });
  });

  it('after Back to studying, visiting the site again right away shows the page again', async () => {
    const { store, deps } = await setup('intention');
    await checkTab(deps, { tabId: 3, url: YT }, 'en.wikipedia.org', T0 + MIN);
    await recordChoice(deps, 'intention', 'back', 's1', 'youtube.com', 3, T0 + MIN + 500);
    // Going back passes through the site: go back once more.
    expect((await checkTab(deps, { tabId: 3, url: YT }, null, T0 + MIN + 700)).type).toBe(
      'go-back',
    );
    // A new visit 1 s after the first redirect is not mistaken for a duplicate event.
    const again = await checkTab(deps, { tabId: 3, url: YT }, 'en.wikipedia.org', T0 + MIN + 1000);
    expect(again.type).toBe('redirect');
    expect(await counts(store, 'intention')).toEqual({ shown: 2, continued: 0, back: 1 });
  });

  it('a choice for an unknown session changes no counts', async () => {
    const { store, deps } = await setup();
    await recordChoice(deps, 'friction', 'continue', 'nope', 'youtube.com', 3, T0);
    expect(await counts(store)).toEqual(ZERO);
    // And it never wipes the running session's state.
    expect((await loadInterstitialState(store))?.sessionId ?? 's1').toBe('s1');
  });

  it('new sessions start with all counts at 0', async () => {
    const { store } = await setup('control');
    const s = await loadActiveSession(store);
    expect(s).toMatchObject(NO_COUNTS);
  });
});

/** Every string in `value`, at any depth (keys too). */
function allText(value: unknown): string {
  return JSON.stringify(value);
}

describe('privacy: no full URL is ever stored', () => {
  it.each(['friction', 'intention'] as const)(
    'after every %s path, storage holds only hostnames and counts',
    async (mode) => {
      const { store, deps, sessionDeps } = await setup(mode);
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
        await recordChoice(deps, mode, i === 1 ? 'back' : 'continue', 's1', 'youtube.com', i, now);
        await checkTab(deps, { tabId: i, url }, null, now + 1000);
        now += GRACE_MS;
      }
      await endSessionEarly(sessionDeps, now);

      const dump = allText(store.data);
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
      expect(store.data[INTERSTITIAL_STATE_KEY]).toBeTruthy();
      const [done] = await loadSessions(store);
      expect(done).toMatchObject(
        mode === 'friction'
          ? { frictionShown: 3, frictionContinued: 2, frictionTurnedBack: 1 }
          : { intentionShown: 3, intentionContinued: 2, intentionTurnedBack: 1 },
      );
    },
  );
});

describe('privacy: what the user types on the intention page never reaches storage', () => {
  it('runs the full page → background path with typed answers; none of the text is stored', async () => {
    const { store, deps, sessionDeps } = await setup('intention');
    const answers = [
      'checking my chem lecture notes TYPED-SECRET-1',
      'just one music video TYPED-SECRET-2',
      'zzzzzz-unique-answer-TYPED-SECRET-3',
    ];
    let now = T0 + MIN;
    for (const [i, answer] of answers.entries()) {
      now += MIN;
      const action = await checkTab(deps, { tabId: i, url: YT }, 'en.wikipedia.org', now);
      if (action.type !== 'redirect') throw new Error('expected redirect');
      // What the page does: it parses its own address, the user types, the page builds its
      // message. The background only ever gets that message.
      const info = parseInterstitialPage(new URL(action.url).search);
      if (info?.kind !== 'prompt') throw new Error('expected a prompt page');
      expect(intentionReady(answer)).toBe(true);
      const msg = choiceMessage(info, i === 1 ? 'back' : 'continue');
      expect(allText(msg)).not.toContain('TYPED-SECRET');
      await recordChoice(deps, msg.mode, msg.choice, msg.sessionId, msg.hostname, i, now);
      now += GRACE_MS;
    }
    await endSessionEarly(sessionDeps, now);

    const dump = allText(store.data);
    for (const answer of answers) {
      expect(dump).not.toContain(answer);
      for (const word of answer.split(' ')) if (word.length > 4) expect(dump).not.toContain(word);
    }
    expect(dump).not.toContain('TYPED-SECRET');
    const [done] = await loadSessions(store);
    expect(done).toMatchObject({
      intentionShown: 3,
      intentionContinued: 2,
      intentionTurnedBack: 1,
    });
  });
});
