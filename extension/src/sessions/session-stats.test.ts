import { describe, expect, it } from 'vitest';
import type { CategoryRule } from '../categories/rules';
import type { Segment } from '../tracker/tracker';
import { computeSessionStats, siteRuns, VISIT_MERGE_GAP_MS } from './session-stats';

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

  it('does not count coming back to the same distraction site after any gap', () => {
    const result = stats([
      seg('youtube.com', 2, 4), // visit 1
      // 4–6: another app / idle / DevTools — nothing tracked
      seg('youtube.com', 6, 8), // same site again: not a new visit
      // 8–20: a long idle break
      seg('youtube.com', 20, 22), // still the same site: not a new visit
    ]);
    expect(result.distractionVisits).toBe(1);
    expect(result.minutesByCategory.distraction).toBe(6);
  });

  it('counts leaving a distraction site for a different site and coming back', () => {
    const result = stats([
      seg('en.wikipedia.org', 0, 2),
      seg('youtube.com', 2, 4), // visit 1
      seg('en.wikipedia.org', 4, 6),
      seg('youtube.com', 6, 8), // visit 2
    ]);
    expect(result.distractionVisits).toBe(2);
  });

  // The 2026-11-18 Firefox manual test. Gaps are the friction/intention page (an extension page,
  // never recorded), DevTools in another window, and Back/Forward through the interstitial page.
  it('manual test, friction session: one real YouTube visit counts once (was 5)', () => {
    const result = stats([
      seg('en.wikipedia.org', 0, 3),
      // 3–3.2: friction countdown page (not a site)
      seg('www.youtube.com', 3.2, 5),
      // 5–5.5: switched to the DevTools window and back
      seg('www.youtube.com', 5.5, 7),
      // 7–7.5: DevTools again
      seg('www.youtube.com', 7.5, 8),
      // 8–8.1: Back to the friction page, then Forward
      seg('www.youtube.com', 8.1, 9),
      // 9–9.5: DevTools
      seg('youtube.com', 9.5, 10),
      seg('en.wikipedia.org', 10, 25),
    ]);
    expect(result.distractionVisits).toBe(1);
  });

  it('manual test, intention session: one real YouTube visit counts once (was 3)', () => {
    const result = stats([
      seg('en.wikipedia.org', 0, 4),
      // 4–4.3: intention page (not a site)
      seg('www.youtube.com', 4.3, 6),
      // 6–6.4: DevTools window
      seg('www.youtube.com', 6.4, 7),
      // 7–7.1: Back to the intention page, then Forward
      seg('www.youtube.com', 7.1, 8),
      seg('en.wikipedia.org', 8, 25),
    ]);
    expect(result.distractionVisits).toBe(1);
  });

  it('does not count "Back to studying" on the interstitial page (no site time recorded)', () => {
    const result = stats([
      seg('en.wikipedia.org', 0, 5),
      // 5–5.2: friction page, then Back to studying
      seg('en.wikipedia.org', 5.2, 10),
    ]);
    expect(result.distractionVisits).toBe(0);
  });

  it('merges a distraction site left less than a minute before the session started', () => {
    const SEC = 1_000;
    const before = { hostname: 'youtube.com', start: START - 5 * MIN, end: START - 30 * SEC };
    const after = { hostname: 'youtube.com', start: START + 10 * SEC, end: START + 2 * MIN };
    // 40 s gap: the same stretch on YouTube, already open at the start → not a visit.
    expect(stats([before, after]).distractionVisits).toBe(0);
    // Left YouTube 4+ minutes before the start: opening it in the session is a visit.
    const early = { ...before, end: START - 4 * MIN };
    expect(stats([early, after]).distractionVisits).toBe(1);
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

describe('siteRuns', () => {
  it('merges same-site segments separated by under a minute, and keeps others apart', () => {
    const runs = siteRuns(
      [
        seg('youtube.com', 0, 1),
        { hostname: 'm.youtube.com', start: T0 + MIN + VISIT_MERGE_GAP_MS - 1, end: T0 + 3 * MIN },
        seg('youtube.com', 5, 6), // 2 min gap: a new run of the same site
        seg('docs.google.com', 6, 7),
        seg('google.com', 7, 8), // a different site key (rule for docs.google.com)
      ],
      rules,
    );
    expect(runs.map((r) => [r.site, r.category, (r.start - T0) / MIN, (r.end - T0) / MIN])).toEqual(
      [
        ['youtube.com', 'distraction', 0, 3],
        ['youtube.com', 'distraction', 5, 6],
        ['docs.google.com', 'study', 6, 7],
        ['google.com', 'neutral', 7, 8],
      ],
    );
  });

  it('does not change the input segments', () => {
    const input = [seg('youtube.com', 0, 1), seg('youtube.com', 1.5, 2)];
    const copy = structuredClone(input);
    siteRuns(input, rules);
    expect(input).toEqual(copy);
  });
});
