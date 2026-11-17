import { describe, expect, it } from 'vitest';
import type { CategoryRule } from '../categories/rules';
import { asFrictionState } from '../storage/friction-store';
import { describeFriction } from '../my-data/tables';
import {
  BACK_WINDOW_MS,
  DUPLICATE_EVENT_MS,
  FRICTION_COUNTDOWN_SECONDS,
  FRICTION_GRACE_MS,
  NO_FRICTION,
  addFriction,
  cleanHostname,
  decideFriction,
  emptyFrictionState,
  frictionCountsOf,
  frictionDoneUrl,
  frictionPageUrl,
  inGrace,
  parseFrictionPage,
  startGrace,
  stateFor,
  type FrictionContext,
  type TabEntry,
} from './friction';

const T0 = Date.UTC(2026, 10, 23, 15, 0);
const MIN = 60_000;
const rules: CategoryRule[] = [
  { domain: 'youtube.com', category: 'distraction' },
  { domain: 'reddit.com', category: 'distraction' },
  { domain: 'wikipedia.org', category: 'study' },
];

const ctx = (over: Partial<FrictionContext> = {}): FrictionContext => ({
  session: { id: 's1', condition: 'friction' },
  paused: false,
  rules,
  state: null,
  now: T0,
  ...over,
});
const enter = (hostname: string | null, previousHostname: string | null = null): TabEntry => ({
  tabId: 7,
  hostname,
  previousHostname,
});

describe('constants', () => {
  it('uses a 10-second countdown and a 5-minute grace period', () => {
    expect(FRICTION_COUNTDOWN_SECONDS).toBe(10);
    expect(FRICTION_GRACE_MS).toBe(5 * MIN);
  });
});

describe('decideFriction: when to show the countdown', () => {
  it('redirects when entering a Distraction site in a friction session', () => {
    const d = decideFriction(enter('www.youtube.com', 'en.wikipedia.org'), ctx());
    expect(d.action).toBe('redirect');
    if (d.action !== 'redirect') return;
    expect(d.site).toBe('youtube.com');
    expect(d.state).toEqual({
      ...emptyFrictionState('s1'),
      lastRedirect: { tabId: 7, site: 'youtube.com', at: T0 },
    });
  });

  it('subdomains of a labeled site count (m.youtube.com)', () => {
    expect(decideFriction(enter('m.youtube.com'), ctx()).action).toBe('redirect');
  });

  it.each([
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
      'an intention session',
      enter('youtube.com'),
      ctx({ session: { id: 's1', condition: 'intention' } }),
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
  ])('does nothing for %s', (_name, entry, context) => {
    expect(decideFriction(entry, context)).toEqual({ action: 'none', state: null });
  });

  it('moving from one Distraction site to another counts as entering', () => {
    expect(decideFriction(enter('reddit.com', 'youtube.com'), ctx()).action).toBe('redirect');
  });

  it('ignores a duplicate event for the redirect it just made, but not later ones', () => {
    const first = decideFriction(enter('youtube.com'), ctx());
    if (first.action !== 'redirect') throw new Error('expected redirect');
    const again = (now: number, tabId = 7) =>
      decideFriction({ ...enter('youtube.com'), tabId }, ctx({ state: first.state, now })).action;
    expect(again(T0 + 1000)).toBe('none');
    expect(again(T0 + 1000, 8)).toBe('redirect'); // A different tab.
    expect(again(T0 + DUPLICATE_EVENT_MS)).toBe('redirect');
  });
});

describe('grace period', () => {
  it('after Continue, the site gets no friction for 5 minutes in this session', () => {
    const state = startGrace(emptyFrictionState('s1'), 'youtube.com', T0);
    const at = (now: number) => decideFriction(enter('youtube.com'), ctx({ state, now })).action;
    expect(at(T0 + MIN)).toBe('none');
    expect(at(T0 + FRICTION_GRACE_MS - 1)).toBe('none');
    expect(at(T0 + FRICTION_GRACE_MS)).toBe('redirect');
    // Other Distraction sites still get friction.
    expect(decideFriction(enter('reddit.com'), ctx({ state, now: T0 + MIN })).action).toBe(
      'redirect',
    );
  });

  it('a grace period from another session does not apply', () => {
    const state = startGrace(emptyFrictionState('old'), 'youtube.com', T0);
    expect(decideFriction(enter('youtube.com'), ctx({ state, now: T0 + MIN })).action).toBe(
      'redirect',
    );
    expect(stateFor(state, 's1')).toEqual(emptyFrictionState('s1'));
    expect(stateFor(state, 'old')).toBe(state);
  });

  it('drops grace periods that are over when starting a new one', () => {
    let state = startGrace(emptyFrictionState('s1'), 'reddit.com', T0);
    state = startGrace(state, 'youtube.com', T0 + FRICTION_GRACE_MS);
    expect(state.grace).toEqual({ 'youtube.com': T0 + 2 * FRICTION_GRACE_MS });
    expect(inGrace(state, 'youtube.com', T0 + FRICTION_GRACE_MS)).toBe(true);
    expect(inGrace(state, 'reddit.com', T0 + FRICTION_GRACE_MS)).toBe(false);
  });
});

describe('"Back to studying"', () => {
  const back = {
    ...emptyFrictionState('s1'),
    back: { tabId: 7, site: 'youtube.com', until: T0 + BACK_WINDOW_MS },
  };

  it('going back through the site in the same tab goes back once more (no second countdown)', () => {
    expect(decideFriction(enter('youtube.com'), ctx({ state: back }))).toEqual({
      action: 'go-back',
      state: { ...back, back: null },
    });
  });

  it('works even after the session ended', () => {
    expect(decideFriction(enter('youtube.com'), ctx({ state: back, session: null })).action).toBe(
      'go-back',
    );
  });

  it('is cleared when the tab arrives somewhere else, and expires', () => {
    expect(decideFriction(enter('en.wikipedia.org'), ctx({ state: back }))).toEqual({
      action: 'none',
      state: { ...back, back: null },
    });
    expect(
      decideFriction(enter('youtube.com'), ctx({ state: back, now: T0 + BACK_WINDOW_MS + 1 }))
        .action,
    ).toBe('redirect');
    // Another tab is not affected.
    expect(decideFriction({ ...enter('youtube.com'), tabId: 8 }, ctx({ state: back })).action).toBe(
      'redirect',
    );
  });
});

describe('counters', () => {
  it('adds one to the right counter and keeps the rest', () => {
    const s = { id: 'x', ...NO_FRICTION };
    const once = addFriction(addFriction(s, 'frictionShown'), 'frictionShown');
    expect(addFriction(once, 'frictionTurnedBack')).toEqual({
      id: 'x',
      frictionShown: 2,
      frictionContinued: 0,
      frictionTurnedBack: 1,
    });
  });

  it('missing or broken counts (sessions before P9) read as 0', () => {
    expect(frictionCountsOf({})).toEqual(NO_FRICTION);
    expect(
      frictionCountsOf({ frictionShown: -1, frictionContinued: 1.5, frictionTurnedBack: '2' }),
    ).toEqual(NO_FRICTION);
    expect(
      frictionCountsOf({ frictionShown: 3, frictionContinued: 1, frictionTurnedBack: 2 }),
    ).toEqual({
      frictionShown: 3,
      frictionContinued: 1,
      frictionTurnedBack: 2,
    });
  });

  it('describes the counts for My Data', () => {
    expect(describeFriction({ condition: 'control', ...NO_FRICTION })).toBe('—');
    expect(
      describeFriction({
        condition: 'friction',
        frictionShown: 2,
        frictionContinued: 1,
        frictionTurnedBack: 1,
      }),
    ).toBe('2 shown · 1 continued · 1 turned back');
    expect(describeFriction({ condition: 'friction', ...NO_FRICTION })).toBe(
      '0 shown · 0 continued · 0 turned back',
    );
  });
});

describe('countdown page address', () => {
  const page = 'moz-extension://abc/friction.html';

  it('round-trips the target and session', () => {
    const target = 'https://www.youtube.com/watch?v=abc&t=1#x';
    const url = frictionPageUrl(page, target, 's1');
    expect(url.startsWith(`${page}?`)).toBe(true);
    expect(parseFrictionPage(new URL(url).search)).toEqual({
      mode: 'countdown',
      target,
      hostname: 'youtube.com',
      sessionId: 's1',
    });
    expect(parseFrictionPage(new URL(frictionDoneUrl(page, 's1')).search)).toEqual({
      mode: 'done',
      sessionId: 's1',
    });
  });

  it('rejects targets that are not normal web pages', () => {
    for (const target of [
      'javascript:alert(1)',
      'moz-extension://abc/friction.html',
      'about:blank',
      'nope',
    ]) {
      expect(parseFrictionPage(`?to=${encodeURIComponent(target)}&s=s1`)).toBeNull();
    }
    expect(parseFrictionPage('?to=https%3A%2F%2Fyoutube.com%2F')).toBeNull(); // No session.
  });

  it('cleans hostnames sent back by the page', () => {
    expect(cleanHostname('www.YouTube.com')).toBe('youtube.com');
    expect(cleanHostname('youtube.com/watch')).toBeNull();
    expect(cleanHostname('https://youtube.com')).toBeNull();
    expect(cleanHostname(42)).toBeNull();
  });
});

describe('stored friction state', () => {
  it('accepts a valid state and rejects broken ones', () => {
    const state = {
      sessionId: 's1',
      grace: { 'youtube.com': T0, bad: 'x' },
      lastRedirect: { tabId: 1, site: 'youtube.com', at: T0 },
      back: { tabId: 'x' },
    };
    expect(asFrictionState(state)).toEqual({
      sessionId: 's1',
      grace: { 'youtube.com': T0 },
      lastRedirect: { tabId: 1, site: 'youtube.com', at: T0 },
      back: null,
    });
    expect(asFrictionState(null)).toBeNull();
    expect(asFrictionState({ grace: {} })).toBeNull();
  });
});
