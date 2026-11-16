import { describe, expect, it } from 'vitest';
import type { CategoryRule } from '../categories/rules';
import type { Segment } from '../tracker/tracker';
import { computeSessionStats } from './session-stats';

const T0 = Date.UTC(2026, 10, 15, 14, 0, 0);
const MIN = 60_000;
const START = T0;
const END = T0 + 25 * MIN;

const rules: CategoryRule[] = [
  { domain: 'youtube.com', category: 'distraction' },
  { domain: 'reddit.com', category: 'distraction' },
  { domain: 'google.com', category: 'neutral' },
  { domain: 'docs.google.com', category: 'study' },
  { domain: 'canvas.uw.edu', category: 'study' },
];

/** Segment from `a` to `b` minutes after T0. */
const seg = (hostname: string, a: number, b: number): Segment => ({
  hostname,
  start: T0 + a * MIN,
  end: T0 + b * MIN,
});

const stats = (segments: Segment[], start = START, end = END) =>
  computeSessionStats(segments, start, end, rules);

describe('computeSessionStats', () => {
  it('returns zeros for a session with no activity', () => {
    expect(stats([])).toEqual({
      minutesByCategory: { study: 0, neutral: 0, distraction: 0 },
      distractionVisits: 0,
    });
  });

  it('ignores segments entirely outside the session', () => {
    expect(stats([seg('youtube.com', -30, -1), seg('youtube.com', 25, 40)])).toEqual({
      minutesByCategory: { study: 0, neutral: 0, distraction: 0 },
      distractionVisits: 0,
    });
  });

  it('adds time per category using the most specific rule; unlabeled sites are neutral', () => {
    const result = stats([
      seg('docs.google.com', 0, 10),
      seg('mail.google.com', 10, 12),
      seg('en.wikipedia.org', 12, 15),
      seg('m.youtube.com', 15, 19),
    ]);
    expect(result.minutesByCategory).toEqual({ study: 10, neutral: 5, distraction: 4 });
  });

  it('clips segments that only partly overlap the session', () => {
    const result = stats([
      seg('youtube.com', -10, 2), // started before: 2 min inside
      seg('canvas.uw.edu', 2, 20),
      seg('reddit.com', 20, 40), // runs past the end: 5 min inside
    ]);
    expect(result.minutesByCategory).toEqual({ study: 18, neutral: 0, distraction: 7 });
  });

  it('rounds minutes to one decimal', () => {
    const result = stats([{ hostname: 'youtube.com', start: T0, end: T0 + 100_000 }]);
    expect(result.minutesByCategory.distraction).toBe(1.7);
  });

  it('counts each switch into a distraction site as a visit', () => {
    const result = stats([
      seg('docs.google.com', 0, 5),
      seg('youtube.com', 5, 7), // visit 1
      seg('docs.google.com', 7, 12),
      seg('reddit.com', 12, 13), // visit 2
      seg('youtube.com', 13, 15), // visit 3: a different distraction site
      seg('docs.google.com', 15, 25),
    ]);
    expect(result.distractionVisits).toBe(3);
  });

  it('does not count staying on the same distraction site across hostnames', () => {
    const result = stats([
      seg('docs.google.com', 0, 5),
      seg('m.youtube.com', 5, 7), // visit
      seg('youtube.com', 7, 9), // same site, no gap: still the same visit
    ]);
    expect(result.distractionVisits).toBe(1);
  });

  it('counts coming back to the same distraction site after a gap', () => {
    const result = stats([
      seg('youtube.com', 2, 4), // visit 1
      // 4–6: another app / idle — nothing tracked
      seg('youtube.com', 6, 8), // visit 2
    ]);
    expect(result.distractionVisits).toBe(2);
  });

  it('does not count a distraction site that was already open when the session started', () => {
    const result = stats([seg('youtube.com', -5, 3), seg('docs.google.com', 3, 25)]);
    expect(result.distractionVisits).toBe(0);
    expect(result.minutesByCategory.distraction).toBe(3);
  });

  it('counts a distraction site opened exactly at the start', () => {
    expect(stats([seg('reddit.com', 0, 3)]).distractionVisits).toBe(1);
  });

  it('does not count non-distraction switches, and follows the current rules', () => {
    const segments = [seg('docs.google.com', 0, 5), seg('news.example.com', 5, 10)];
    expect(stats(segments).distractionVisits).toBe(0);
    const stricter = computeSessionStats(segments, START, END, [
      ...rules,
      { domain: 'example.com', category: 'distraction' },
    ]);
    expect(stricter.distractionVisits).toBe(1);
    expect(stricter.minutesByCategory.distraction).toBe(5);
  });

  it('handles unsorted input', () => {
    const result = stats([seg('youtube.com', 7, 9), seg('docs.google.com', 0, 7)]);
    expect(result.distractionVisits).toBe(1);
    expect(result.minutesByCategory).toEqual({ study: 7, neutral: 0, distraction: 2 });
  });
});
