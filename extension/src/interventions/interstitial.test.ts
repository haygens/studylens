import { describe, expect, it } from 'vitest';
import type { CategoryRule } from '../categories/rules';
import { asInterstitialState } from '../storage/interstitial-store';
import { describeFriction, describeIntention } from '../my-data/tables';
import {
  BACK_WINDOW_MS,
  DUPLICATE_EVENT_MS,
  FRICTION_COUNTDOWN_SECONDS,
  GRACE_MS,
  INTENTION_MIN_CHARS,
  NO_COUNTS,
  addCount,
  choiceMessage,
  cleanHostname,
  countName,
  countsOf,
  decideInterstitial,
  emptyState,
  inGrace,
  intentionReady,
  interstitialDoneUrl,
  interstitialPageUrl,
  isInterstitialMode,
  modeFor,
  parseInterstitialPage,
  startGrace,
  stateFor,
  type InterstitialContext,
  type InterstitialMode,
  type TabEntry,
} from './interstitial';

const T0 = Date.UTC(2026, 10, 23, 15, 0);
const MIN = 60_000;
const rules: CategoryRule[] = [
  { domain: 'youtube.com', category: 'distraction' },
  { domain: 'reddit.com', category: 'distraction' },
  { domain: 'wikipedia.org', category: 'study' },
];

const ctx = (over: Partial<InterstitialContext> = {}): InterstitialContext => ({
  session: { id: 's1', condition: 'friction' },
  paused: false,
  rules,
  state: null,
  now: T0,
  ...over,
});
const intention = (over: Partial<InterstitialContext> = {}) =>
  ctx({ session: { id: 's1', condition: 'intention' }, ...over });
const enter = (hostname: string | null, previousHostname: string | null = null): TabEntry => ({
  tabId: 7,
  hostname,
  previousHostname,
});

describe('constants', () => {
  it('uses a 10 s countdown, 3 characters for intention, and a 5-minute grace period', () => {
    expect(FRICTION_COUNTDOWN_SECONDS).toBe(10);
    expect(INTENTION_MIN_CHARS).toBe(3);
    expect(GRACE_MS).toBe(5 * MIN);
  });
});

describe('modes', () => {
  it('maps conditions to modes', () => {
    expect(modeFor('friction')).toBe('friction');
    expect(modeFor('intention')).toBe('intention');
    for (const c of ['control', 'opted-out', null] as const) expect(modeFor(c)).toBeNull();
    expect(isInterstitialMode('intention')).toBe(true);
    expect(isInterstitialMode('control')).toBe(false);
    expect(isInterstitialMode(undefined)).toBe(false);
  });
});

describe('decideInterstitial: when to show the page', () => {
  it.each(['friction', 'intention'] as const)(
    'redirects in %s mode when entering a Distraction site in that kind of session',
    (mode) => {
      const context = ctx({ session: { id: 's1', condition: mode } });
      const d = decideInterstitial(enter('www.youtube.com', 'en.wikipedia.org'), context);
      expect(d.action).toBe('redirect');
      if (d.action !== 'redirect') return;
      expect(d.mode).toBe(mode);
      expect(d.site).toBe('youtube.com');
      expect(d.state).toEqual({
        ...emptyState('s1'),
        lastRedirect: { tabId: 7, site: 'youtube.com', at: T0 },
      });
    },
  );

  it('subdomains of a labeled site count (m.youtube.com)', () => {
    expect(decideInterstitial(enter('m.youtube.com'), ctx()).action).toBe('redirect');
    expect(decideInterstitial(enter('m.youtube.com'), intention()).action).toBe('redirect');
  });

  const noPage: [string, TabEntry, InterstitialContext][] = [
    ['a Study site', enter('en.wikipedia.org'), ctx()],
    ['an unlabeled (neutral) site', enter('example.com'), ctx()],
    ['a page that is not a website', enter(null), ctx()],
    ['no running session', enter('youtube.com'), ctx({ session: null })],
    [
      'a control session',
      enter('youtube.com'),
      ctx({ session: { id: 's1', condition: 'control' } }),
    ],
    [
      'an opted-out session',
      enter('youtube.com'),
      ctx({ session: { id: 's1', condition: 'opted-out' } }),
    ],
    [
      'a session with no condition',
      enter('youtube.com'),
      ctx({ session: { id: 's1', condition: null } }),
    ],
    ['paused tracking', enter('youtube.com'), ctx({ paused: true })],
    ['staying on the same site', enter('youtube.com', 'm.youtube.com'), ctx()],
    // The same rules hold in intention sessions.
    ['a Study site (intention)', enter('en.wikipedia.org'), intention()],
    ['an unlabeled site (intention)', enter('example.com'), intention()],
    ['a page that is not a website (intention)', enter(null), intention()],
    ['paused tracking (intention)', enter('youtube.com'), intention({ paused: true })],
    ['staying on the same site (intention)', enter('youtube.com', 'm.youtube.com'), intention()],
  ];
  it.each(noPage)('does nothing for %s', (_name, entry, context) => {
    expect(decideInterstitial(entry, context)).toEqual({ action: 'none', state: null });
  });

  it('moving from one Distraction site to another counts as entering', () => {
    expect(decideInterstitial(enter('reddit.com', 'youtube.com'), ctx()).action).toBe('redirect');
    expect(decideInterstitial(enter('reddit.com', 'youtube.com'), intention()).action).toBe(
      'redirect',
    );
  });

  it('ignores a duplicate event for the redirect it just made, but not later ones', () => {
    const first = decideInterstitial(enter('youtube.com'), ctx());
    if (first.action !== 'redirect') throw new Error('expected redirect');
    const again = (now: number, tabId = 7) =>
      decideInterstitial({ ...enter('youtube.com'), tabId }, ctx({ state: first.state, now }))
        .action;
    expect(again(T0 + 1000)).toBe('none');
    expect(again(T0 + 1000, 8)).toBe('redirect'); // A different tab.
    expect(again(T0 + DUPLICATE_EVENT_MS)).toBe('redirect');
  });
});

describe('grace period', () => {
  it.each(['friction', 'intention'] as const)(
    'after Continue, the site gets no page for 5 minutes in this session (%s)',
    (mode) => {
      const state = startGrace(emptyState('s1'), 'youtube.com', T0);
      const c = (now: number) => ctx({ session: { id: 's1', condition: mode }, state, now });
      const at = (now: number) => decideInterstitial(enter('youtube.com'), c(now)).action;
      expect(at(T0 + MIN)).toBe('none');
      expect(at(T0 + GRACE_MS - 1)).toBe('none');
      expect(at(T0 + GRACE_MS)).toBe('redirect');
      // Other Distraction sites still get the page.
      expect(decideInterstitial(enter('reddit.com'), c(T0 + MIN)).action).toBe('redirect');
    },
  );

  it('a grace period from another session does not apply', () => {
    const state = startGrace(emptyState('old'), 'youtube.com', T0);
    expect(decideInterstitial(enter('youtube.com'), ctx({ state, now: T0 + MIN })).action).toBe(
      'redirect',
    );
    expect(stateFor(state, 's1')).toEqual(emptyState('s1'));
    expect(stateFor(state, 'old')).toBe(state);
  });

  it('drops grace periods that are over when starting a new one', () => {
    let state = startGrace(emptyState('s1'), 'reddit.com', T0);
    state = startGrace(state, 'youtube.com', T0 + GRACE_MS);
    expect(state.grace).toEqual({ 'youtube.com': T0 + 2 * GRACE_MS });
    expect(inGrace(state, 'youtube.com', T0 + GRACE_MS)).toBe(true);
    expect(inGrace(state, 'reddit.com', T0 + GRACE_MS)).toBe(false);
  });
});

describe('"Back to studying"', () => {
  const back = {
    ...emptyState('s1'),
    back: { tabId: 7, site: 'youtube.com', until: T0 + BACK_WINDOW_MS },
  };

  it('going back through the site in the same tab goes back once more (no second page)', () => {
    expect(decideInterstitial(enter('youtube.com'), ctx({ state: back }))).toEqual({
      action: 'go-back',
      state: { ...back, back: null },
    });
    expect(decideInterstitial(enter('youtube.com'), intention({ state: back })).action).toBe(
      'go-back',
    );
  });

  it('works even after the session ended', () => {
    expect(
      decideInterstitial(enter('youtube.com'), ctx({ state: back, session: null })).action,
    ).toBe('go-back');
  });

  it('is cleared when the tab arrives somewhere else, and expires', () => {
    expect(decideInterstitial(enter('en.wikipedia.org'), ctx({ state: back }))).toEqual({
      action: 'none',
      state: { ...back, back: null },
    });
    expect(
      decideInterstitial(enter('youtube.com'), ctx({ state: back, now: T0 + BACK_WINDOW_MS + 1 }))
        .action,
    ).toBe('redirect');
    // Another tab is not affected.
    expect(
      decideInterstitial({ ...enter('youtube.com'), tabId: 8 }, ctx({ state: back })).action,
    ).toBe('redirect');
  });
});

describe('counters', () => {
  it('names the counter for each mode and event', () => {
    expect(countName('friction', 'shown')).toBe('frictionShown');
    expect(countName('friction', 'continue')).toBe('frictionContinued');
    expect(countName('friction', 'back')).toBe('frictionTurnedBack');
    expect(countName('intention', 'shown')).toBe('intentionShown');
    expect(countName('intention', 'continue')).toBe('intentionContinued');
    expect(countName('intention', 'back')).toBe('intentionTurnedBack');
  });

  it('adds one to the right counter and keeps the rest', () => {
    const s = { id: 'x', ...NO_COUNTS };
    const once = addCount(addCount(s, 'frictionShown'), 'frictionShown');
    expect(addCount(addCount(once, 'frictionTurnedBack'), 'intentionContinued')).toEqual({
      id: 'x',
      ...NO_COUNTS,
      frictionShown: 2,
      frictionTurnedBack: 1,
      intentionContinued: 1,
    });
  });

  it('missing or broken counts (older sessions) read as 0', () => {
    expect(countsOf({})).toEqual(NO_COUNTS);
    expect(countsOf(null)).toEqual(NO_COUNTS);
    expect(countsOf({ frictionShown: -1, frictionContinued: 1.5, intentionShown: '2' })).toEqual(
      NO_COUNTS,
    );
    const all = {
      frictionShown: 3,
      frictionContinued: 1,
      frictionTurnedBack: 2,
      intentionShown: 4,
      intentionContinued: 3,
      intentionTurnedBack: 1,
    };
    expect(countsOf({ ...all, extra: 'ignored' })).toEqual(all);
  });

  it('describes the counts for My Data', () => {
    expect(describeFriction({ condition: 'control', ...NO_COUNTS })).toBe('—');
    expect(describeIntention({ condition: 'friction', ...NO_COUNTS })).toBe('—');
    expect(
      describeFriction({
        ...NO_COUNTS,
        condition: 'friction',
        frictionShown: 2,
        frictionContinued: 1,
        frictionTurnedBack: 1,
      }),
    ).toBe('2 shown · 1 continued · 1 turned back');
    expect(describeFriction({ condition: 'friction', ...NO_COUNTS })).toBe(
      '0 shown · 0 continued · 0 turned back',
    );
    expect(describeIntention({ ...NO_COUNTS, condition: 'intention', intentionShown: 1 })).toBe(
      '1 shown · 0 continued · 0 turned back',
    );
  });
});

describe('intention answer', () => {
  it.each([
    ['', false],
    ['  ', false],
    ['ab', false],
    [' a b ', false],
    ['a\tb\n', false],
    ['abc', true],
    [' a b c ', true],
    ['hw?', true],
  ])('%j enables Continue: %s', (text, ready) => {
    expect(intentionReady(text)).toBe(ready);
  });
});

describe('message to the background', () => {
  const page = 'moz-extension://abc/interstitial.html';

  it('carries only the choice, mode, session and hostname — no typed text, no address', () => {
    const target = 'https://www.youtube.com/watch?v=SECRET';
    const info = parseInterstitialPage(
      new URL(interstitialPageUrl(page, 'intention', target, 's1')).search,
    );
    if (info?.kind !== 'prompt') throw new Error('expected a prompt page');
    for (const choice of ['continue', 'back'] as const) {
      const msg = choiceMessage(info, choice);
      expect(msg).toEqual({
        type: 'interstitial:choice',
        choice,
        mode: 'intention',
        sessionId: 's1',
        hostname: 'youtube.com',
      });
      expect(JSON.stringify(msg)).not.toMatch(/SECRET|watch|https?:/);
    }
  });
});

describe('interstitial page address', () => {
  const page = 'moz-extension://abc/interstitial.html';

  it.each(['friction', 'intention'] as InterstitialMode[])(
    'round-trips the mode, target and session (%s)',
    (mode) => {
      const target = 'https://www.youtube.com/watch?v=abc&t=1#x';
      const url = interstitialPageUrl(page, mode, target, 's1');
      expect(url.startsWith(`${page}?`)).toBe(true);
      expect(parseInterstitialPage(new URL(url).search)).toEqual({
        kind: 'prompt',
        mode,
        target,
        hostname: 'youtube.com',
        sessionId: 's1',
      });
    },
  );

  it('parses the "back to studying" page', () => {
    expect(parseInterstitialPage(new URL(interstitialDoneUrl(page, 's1')).search)).toEqual({
      kind: 'done',
      sessionId: 's1',
    });
  });

  it('rejects targets that are not normal web pages, and unknown modes', () => {
    for (const target of [
      'javascript:alert(1)',
      'moz-extension://abc/interstitial.html',
      'about:blank',
      'nope',
    ]) {
      expect(parseInterstitialPage(`?m=friction&to=${encodeURIComponent(target)}&s=s1`)).toBeNull();
    }
    const yt = encodeURIComponent('https://youtube.com/');
    expect(parseInterstitialPage(`?m=friction&to=${yt}`)).toBeNull(); // No session.
    expect(parseInterstitialPage(`?to=${yt}&s=s1`)).toBeNull(); // No mode.
    expect(parseInterstitialPage(`?m=control&to=${yt}&s=s1`)).toBeNull();
  });

  it('cleans hostnames sent back by the page', () => {
    expect(cleanHostname('www.YouTube.com')).toBe('youtube.com');
    expect(cleanHostname('youtube.com/watch')).toBeNull();
    expect(cleanHostname('https://youtube.com')).toBeNull();
    expect(cleanHostname(42)).toBeNull();
  });
});

describe('stored interstitial state', () => {
  it('accepts a valid state and rejects broken ones', () => {
    const state = {
      sessionId: 's1',
      grace: { 'youtube.com': T0, bad: 'x' },
      lastRedirect: { tabId: 1, site: 'youtube.com', at: T0 },
      back: { tabId: 'x' },
    };
    expect(asInterstitialState(state)).toEqual({
      sessionId: 's1',
      grace: { 'youtube.com': T0 },
      lastRedirect: { tabId: 1, site: 'youtube.com', at: T0 },
      back: null,
    });
    expect(asInterstitialState(null)).toBeNull();
    expect(asInterstitialState({ grace: {} })).toBeNull();
  });
});
