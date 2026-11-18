import { describe, expect, it } from 'vitest';
import {
  MAX_GAP_MS,
  initialState,
  step,
  type Segment,
  type TrackerContext,
  type TrackerEvent,
  type TrackerState,
} from './tracker';
import { trackableHostname } from './hostname';

const T0 = Date.UTC(2026, 10, 14, 15, 0, 0);
const SEC = 1_000;
const MIN = 60 * SEC;

/** Tiny harness: a fake clock plus a tracker that collects every closed segment. */
function harness(context: Partial<TrackerContext> = {}) {
  let now = T0;
  let state: TrackerState = {
    ...initialState(),
    context: { ...initialState().context, windowFocused: true, ...context },
  };
  const segments: Segment[] = [];
  return {
    get state() {
      return state;
    },
    segments,
    advance(ms: number) {
      now += ms;
    },
    send(event: TrackerEvent) {
      const result = step(state, event, now);
      state = result.state;
      segments.push(...result.segments);
    },
    /** Simulates the background script being suspended: only the persisted JSON survives. */
    suspend() {
      state = JSON.parse(JSON.stringify(state)) as TrackerState;
    },
  };
}

const seg = (hostname: string, startOffset: number, endOffset: number): Segment => ({
  hostname,
  start: T0 + startOffset,
  end: T0 + endOffset,
});

describe('tracker step', () => {
  it('switching tabs closes the old site and opens the new one', () => {
    const t = harness();
    t.send({ type: 'tab', hostname: 'docs.google.com' });
    t.advance(30 * SEC);
    t.send({ type: 'tab', hostname: 'youtube.com' });
    t.advance(20 * SEC);
    t.send({ type: 'tab', hostname: 'docs.google.com' });

    expect(t.segments).toEqual([
      seg('docs.google.com', 0, 30 * SEC),
      seg('youtube.com', 30 * SEC, 50 * SEC),
    ]);
    expect(t.state.open).toEqual({
      hostname: 'docs.google.com',
      start: T0 + 50 * SEC,
      lastSeen: T0 + 50 * SEC,
    });
  });

  it('a URL change within the same tab switches the hostname', () => {
    const t = harness();
    t.send({ type: 'tab', hostname: trackableHostname('https://en.wikipedia.org/wiki/Cat') });
    t.advance(10 * SEC);
    // Same site, different page: still one segment.
    t.send({ type: 'tab', hostname: trackableHostname('https://en.wikipedia.org/wiki/Dog?x=1') });
    t.advance(10 * SEC);
    t.send({ type: 'tab', hostname: trackableHostname('https://www.reddit.com/r/all') });

    expect(t.segments).toEqual([seg('en.wikipedia.org', 0, 20 * SEC)]);
    expect(t.state.open?.hostname).toBe('reddit.com');
  });

  it('stops when the browser loses focus and resumes when it regains it', () => {
    const t = harness();
    t.send({ type: 'tab', hostname: 'example.com' });
    t.advance(15 * SEC);
    t.send({ type: 'focus', focused: false });
    t.advance(5 * MIN);
    expect(t.state.open).toBeNull();
    t.send({ type: 'focus', focused: true });
    t.advance(10 * SEC);
    t.send({ type: 'tab', hostname: null });

    expect(t.segments).toEqual([
      seg('example.com', 0, 15 * SEC),
      seg('example.com', 15 * SEC + 5 * MIN, 25 * SEC + 5 * MIN),
    ]);
  });

  it.each(['idle', 'locked'] as const)('stops when the user goes %s', (idle) => {
    const t = harness();
    t.send({ type: 'tab', hostname: 'example.com' });
    t.advance(40 * SEC);
    t.send({ type: 'idle', state: idle });
    t.advance(10 * MIN);
    t.send({ type: 'heartbeat' });
    expect(t.state.open).toBeNull();
    t.send({ type: 'idle', state: 'active' });
    t.advance(5 * SEC);
    t.send({ type: 'focus', focused: false });

    expect(t.segments).toEqual([
      seg('example.com', 0, 40 * SEC),
      seg('example.com', 40 * SEC + 10 * MIN, 45 * SEC + 10 * MIN),
    ]);
  });

  it('does not track ignored schemes and new tab pages', () => {
    for (const url of [
      'about:newtab',
      'about:blank',
      'edge://newtab/',
      'chrome://extensions',
      'moz-extension://abc/popup.html',
      'chrome-extension://abc/popup.html',
      // The friction/intention page is never a site (session-stats relies on this).
      'moz-extension://abc/interstitial.html?url=https%3A%2F%2Fwww.youtube.com%2F',
      'chrome-extension://abc/interstitial.html?url=https%3A%2F%2Fwww.youtube.com%2F',
      'file:///C:/Users/me/notes.txt',
      'data:text/html,hi',
      'https://ntp.msn.com/edge/ntp?locale=en',
      'not a url',
      '',
      undefined,
    ]) {
      expect(trackableHostname(url), String(url)).toBeNull();
    }

    const t = harness();
    t.send({ type: 'tab', hostname: trackableHostname('https://example.com/a') });
    t.advance(10 * SEC);
    t.send({ type: 'tab', hostname: trackableHostname('about:newtab') });
    t.advance(1 * MIN);
    t.send({ type: 'heartbeat' });

    expect(t.state.open).toBeNull();
    expect(t.segments).toEqual([seg('example.com', 0, 10 * SEC)]);
  });

  it('keeps only the hostname, never path, query, port or credentials', () => {
    expect(trackableHostname('https://user:pw@WWW.YouTube.com:8080/watch?v=abc#t=1')).toBe(
      'youtube.com',
    );
    expect(trackableHostname('http://localhost:3000/api/health')).toBe('localhost');
  });

  it('recovers after a suspension: heartbeats keep the segment going', () => {
    const t = harness();
    t.send({ type: 'tab', hostname: 'example.com' });
    for (let i = 0; i < 5; i++) {
      t.advance(1 * MIN);
      t.suspend(); // background script killed between alarms
      t.send({ type: 'heartbeat' });
    }
    t.advance(20 * SEC);
    t.suspend();
    t.send({ type: 'tab', hostname: 'other.com' });

    expect(t.segments).toEqual([seg('example.com', 0, 5 * MIN + 20 * SEC)]);
  });

  it('recovers after a crash: a stale segment is closed at its last confirmed time', () => {
    const t = harness();
    t.send({ type: 'tab', hostname: 'example.com' });
    t.advance(1 * MIN);
    t.send({ type: 'heartbeat' });
    // Browser crashes; it restarts 3 hours later and the wake-up sync runs.
    t.advance(3 * 60 * MIN);
    t.suspend();
    t.send({
      type: 'sync',
      context: { hostname: 'news.com', windowFocused: true, idle: 'active', paused: false },
    });

    expect(t.segments).toEqual([seg('example.com', 0, 1 * MIN)]);
    expect(t.state.open).toEqual({
      hostname: 'news.com',
      start: T0 + 1 * MIN + 180 * MIN,
      lastSeen: T0 + 1 * MIN + 180 * MIN,
    });
  });

  it('caps a single gap: up to MAX_GAP_MS is trusted, beyond it nothing is counted', () => {
    const atCap = harness();
    atCap.send({ type: 'tab', hostname: 'example.com' });
    atCap.advance(MAX_GAP_MS);
    atCap.send({ type: 'heartbeat' });
    expect(atCap.state.open?.lastSeen).toBe(T0 + MAX_GAP_MS);

    const overCap = harness();
    overCap.send({ type: 'tab', hostname: 'example.com' });
    overCap.advance(30 * SEC);
    overCap.send({ type: 'heartbeat' });
    overCap.advance(MAX_GAP_MS + 1);
    overCap.send({ type: 'heartbeat' });
    // Old segment closed at its last heartbeat; a fresh one starts now (same site, still active).
    expect(overCap.segments).toEqual([seg('example.com', 0, 30 * SEC)]);
    expect(overCap.state.open?.start).toBe(T0 + 30 * SEC + MAX_GAP_MS + 1);
  });

  it('treats a clock jumping backwards like a stale gap', () => {
    const t = harness();
    t.send({ type: 'tab', hostname: 'example.com' });
    t.advance(30 * SEC);
    t.send({ type: 'heartbeat' });
    t.advance(-10 * MIN);
    t.send({ type: 'heartbeat' });
    expect(t.segments).toEqual([seg('example.com', 0, 30 * SEC)]);
  });

  it('drops segments shorter than 1 second', () => {
    const t = harness();
    t.send({ type: 'tab', hostname: 'redirect.com' });
    t.advance(999);
    t.send({ type: 'tab', hostname: 'example.com' });
    t.advance(1000);
    t.send({ type: 'tab', hostname: null });

    expect(t.segments).toEqual([seg('example.com', 999, 1999)]);
  });

  it('respects the paused flag', () => {
    const t = harness();
    t.send({ type: 'tab', hostname: 'example.com' });
    t.advance(10 * SEC);
    t.send({ type: 'paused', paused: true });
    t.advance(10 * MIN);
    t.send({ type: 'tab', hostname: 'youtube.com' });
    t.send({ type: 'heartbeat' });
    expect(t.state.open).toBeNull();
    t.send({ type: 'paused', paused: false });
    t.advance(5 * SEC);
    t.send({ type: 'focus', focused: false });

    expect(t.segments).toEqual([
      seg('example.com', 0, 10 * SEC),
      seg('youtube.com', 10 * SEC + 10 * MIN, 15 * SEC + 10 * MIN),
    ]);
  });

  it('does nothing until the window is focused', () => {
    const t = harness({ windowFocused: false });
    t.send({ type: 'tab', hostname: 'example.com' });
    t.advance(1 * MIN);
    t.send({ type: 'heartbeat' });
    expect(t.state.open).toBeNull();
    expect(t.segments).toEqual([]);
  });
});
