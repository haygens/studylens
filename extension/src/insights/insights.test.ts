import { describe, expect, it } from 'vitest';
import { NO_ATTEMPTS } from '../interventions/attempts';
import { NEW_SESSION_FIELDS } from '../sessions/session';
import type { CheckIn, SessionCondition } from '@studylens/shared';
import type { CategoryRule } from '../categories/rules';
import { NO_COUNTS } from '../interventions/interstitial';
import type { FocusSession } from '../sessions/session';
import {
  buildInsights,
  conditionComparison,
  dailyTotals,
  excludedText,
  focusByTimeOfDay,
  hourBandOf,
  lastDays,
  splitAtLocalMidnight,
} from './insights';

const MIN = 60_000;
/** Local time, so the tests pass in any time zone. Month is 1-based here. */
const at = (month: number, day: number, h: number, m = 0) =>
  new Date(2026, month - 1, day, h, m).getTime();
const NOW = at(11, 18, 15);

const rules: CategoryRule[] = [
  { domain: 'youtube.com', category: 'distraction' },
  { domain: 'wikipedia.org', category: 'study' },
];

let nextId = 0;
function session(
  start: number,
  minutes: number,
  opts: {
    condition?: SessionCondition | null;
    visits?: number;
    distraction?: number;
    checkIn?: CheckIn | null;
  } = {},
): FocusSession {
  return {
    id: `s${nextId++}`,
    goal: 'Goal',
    plannedMinutes: minutes,
    start,
    plannedEnd: start + minutes * MIN,
    actualEnd: start + minutes * MIN,
    endedEarly: false,
    condition: opts.condition === undefined ? 'control' : opts.condition,
    minutesByCategory: { study: 0, neutral: 0, distraction: opts.distraction ?? 0 },
    distractionVisits: opts.visits ?? 0,
    checkIn: opts.checkIn ?? null,
    ...NO_COUNTS,
    ...NO_ATTEMPTS,
    ...NEW_SESSION_FIELDS,
  };
}

const rated = (
  focusRating: 1 | 2 | 3 | 4 | 5,
  goalCompleted: 'yes' | 'partly' | 'no' = 'yes',
): CheckIn => ({ focusRating, goalCompleted, answeredAt: 0 });
const skipped: CheckIn = { skipped: true, reason: 'user', answeredAt: 0 };

describe('splitAtLocalMidnight', () => {
  it('keeps a same-day range whole', () => {
    expect(splitAtLocalMidnight(at(11, 16, 9), at(11, 16, 10))).toEqual([
      { day: '2026-11-16', start: at(11, 16, 9), end: at(11, 16, 10) },
    ]);
  });

  it('splits a range at local midnight', () => {
    expect(splitAtLocalMidnight(at(11, 16, 23, 30), at(11, 17, 0, 45))).toEqual([
      { day: '2026-11-16', start: at(11, 16, 23, 30), end: at(11, 17, 0) },
      { day: '2026-11-17', start: at(11, 17, 0), end: at(11, 17, 0, 45) },
    ]);
  });

  it('splits across several days and returns nothing for an empty range', () => {
    expect(splitAtLocalMidnight(at(11, 14, 22), at(11, 16, 1)).map((p) => p.day)).toEqual([
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    expect(splitAtLocalMidnight(at(11, 16, 9), at(11, 16, 9))).toEqual([]);
  });
});

describe('lastDays', () => {
  it('lists 14 local days ending today, oldest first, across a month boundary', () => {
    const days = lastDays(at(12, 3, 8), 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('2026-11-20');
    expect(days.at(-1)).toBe('2026-12-03');
  });
});

describe('dailyTotals', () => {
  it('returns 14 zero days when there is nothing stored', () => {
    const days = dailyTotals([], [], rules, NOW);
    expect(days).toHaveLength(14);
    expect(days.every((d) => d.focusMinutes + d.studyMinutes + d.distractionMinutes === 0)).toBe(
      true,
    );
  });

  it('splits a session that crosses midnight between both days', () => {
    const days = dailyTotals([session(at(11, 16, 23, 40), 50)], [], rules, NOW);
    const byDay = Object.fromEntries(days.map((d) => [d.day, d.focusMinutes]));
    expect(byDay['2026-11-16']).toBe(20);
    expect(byDay['2026-11-17']).toBe(30);
  });

  it('splits activity records at midnight and adds study and distraction minutes', () => {
    const segments = [
      // Stored under Nov 16 (its start day), but 15 of its 25 minutes are on Nov 17.
      { hostname: 'en.wikipedia.org', start: at(11, 16, 23, 50), end: at(11, 17, 0, 15) },
      { hostname: 'www.youtube.com', start: at(11, 17, 9), end: at(11, 17, 9, 6) },
      { hostname: 'example.com', start: at(11, 17, 10), end: at(11, 17, 11) }, // neutral
    ];
    const days = dailyTotals([], segments, rules, NOW);
    const d16 = days.find((d) => d.day === '2026-11-16');
    const d17 = days.find((d) => d.day === '2026-11-17');
    expect(d16).toMatchObject({ studyMinutes: 10, distractionMinutes: 0 });
    expect(d17).toMatchObject({ studyMinutes: 15, distractionMinutes: 6 });
  });

  it('ignores time outside the 14-day window, but keeps the part of a record inside it', () => {
    const first = lastDays(NOW, 14)[0] ?? '';
    const days = dailyTotals(
      [session(at(11, 1, 9), 25)],
      [{ hostname: 'wikipedia.org', start: at(11, 4, 23, 30), end: at(11, 5, 0, 10) }],
      rules,
      NOW,
    );
    expect(first).toBe('2026-11-05');
    expect(days[0]).toMatchObject({ day: '2026-11-05', studyMinutes: 10, focusMinutes: 0 });
    expect(days.reduce((sum, d) => sum + d.focusMinutes, 0)).toBe(0);
  });
});

describe('focusByTimeOfDay', () => {
  it('maps hours to bands, with night wrapping past midnight', () => {
    expect([4, 5, 11, 12, 16, 17, 21, 22, 0].map((h) => hourBandOf(at(11, 16, h)))).toEqual([
      'night',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
      'night',
    ]);
  });

  it('averages answered ratings by start time and skips unanswered sessions', () => {
    const bands = focusByTimeOfDay([
      session(at(11, 16, 9), 25, { checkIn: rated(4) }),
      session(at(11, 17, 10), 25, { checkIn: rated(5) }),
      session(at(11, 17, 11), 25, { checkIn: skipped }),
      session(at(11, 17, 23, 30), 50, { checkIn: rated(2) }), // night, crosses midnight
      session(at(11, 17, 14), 25), // not answered yet
    ]);
    expect(bands.map((b) => [b.band, b.ratedSessions, b.averageRating])).toEqual([
      ['morning', 2, 4.5],
      ['afternoon', 0, null],
      ['evening', 0, null],
      ['night', 1, 2],
    ]);
  });
});

describe('conditionComparison', () => {
  it('shows averages only for conditions with at least 3 sessions', () => {
    const sessions = [
      session(at(11, 16, 9), 25, { visits: 2, distraction: 4, checkIn: rated(3, 'yes') }),
      session(at(11, 16, 10), 25, { visits: 1, distraction: 2, checkIn: rated(4, 'partly') }),
      session(at(11, 16, 11), 25, { visits: 0, distraction: 0, checkIn: skipped }),
      session(at(11, 16, 12), 25, { condition: 'friction', visits: 1, checkIn: rated(5) }),
      session(at(11, 16, 13), 25, { condition: 'friction', visits: 3 }),
    ];
    const { rows } = conditionComparison(sessions);
    const [control, friction, intention] = rows;
    expect(control).toEqual({
      condition: 'control',
      sessions: 3,
      enoughData: true,
      averageVisits: 1,
      averageDistractionMinutes: 2,
      answeredSessions: 2,
      averageRating: 3.5,
      goalPercent: { yes: 50, partly: 50, no: 0 },
      goalCounts: { yes: 1, partly: 1, no: 0 },
    });
    expect(friction).toMatchObject({
      sessions: 2,
      enoughData: false,
      averageVisits: null,
      averageDistractionMinutes: null,
      averageRating: null,
      goalPercent: null,
    });
    expect(intention).toMatchObject({ sessions: 0, enoughData: false });
  });

  it('leaves out opted-out and unassigned sessions, and counts them separately', () => {
    const sessions = [
      session(at(11, 16, 9), 25, { condition: 'opted-out', visits: 9 }),
      session(at(11, 16, 10), 25, { condition: null, visits: 9 }),
      session(at(11, 16, 11), 25, { condition: null }),
      session(at(11, 16, 12), 25, { condition: 'intention', visits: 1 }),
      session(at(11, 16, 13), 25, { condition: 'intention', visits: 2 }),
      session(at(11, 16, 14), 25, { condition: 'intention', visits: 3 }),
    ];
    const { rows, excluded } = conditionComparison(sessions);
    expect(rows.map((r) => r.sessions)).toEqual([0, 0, 3]);
    expect(rows[2]).toMatchObject({ averageVisits: 2, averageRating: null, goalPercent: null });
    expect(excluded).toEqual({ optedOut: 1, noCondition: 2, group: 0 });
  });

  it('rounds goal percentages to whole numbers', () => {
    const sessions = [rated(3, 'yes'), rated(3, 'no'), rated(3, 'no')].map((c, i) =>
      session(at(11, 16, 9 + i), 25, { condition: 'friction', checkIn: c }),
    );
    expect(conditionComparison(sessions).rows[1]?.goalPercent).toEqual({
      yes: 33,
      partly: 0,
      no: 67,
    });
  });
});

describe('buildInsights', () => {
  it('reads sessions, labels and every activity day from a storage snapshot', () => {
    const stored = {
      'sessions:history': [session(at(11, 18, 9), 25, { checkIn: rated(4) })],
      'categories:rules': rules,
      'activity:2026-11-18': [
        { hostname: 'wikipedia.org', start: at(11, 18, 9), end: at(11, 18, 9, 20) },
      ],
      'activity:2026-11-17': [
        { hostname: 'youtube.com', start: at(11, 17, 23, 55), end: at(11, 18, 0, 5) },
      ],
      'sessions:active': null,
      'something:else': 42,
    };
    const insights = buildInsights(stored, NOW);
    expect(insights.totalSessions).toBe(1);
    expect(insights.days.at(-1)).toEqual({
      day: '2026-11-18',
      focusMinutes: 25,
      studyMinutes: 20,
      distractionMinutes: 5,
    });
    expect(insights.timeOfDay[0]).toMatchObject({ band: 'morning', averageRating: 4 });
    expect(insights.conditions.rows[0]).toMatchObject({ sessions: 1, enoughData: false });
  });

  it('handles empty or malformed storage', () => {
    const insights = buildInsights({ 'sessions:history': 'oops', 'activity:2026-11-18': 3 }, NOW);
    expect(insights.totalSessions).toBe(0);
    expect(insights.days).toHaveLength(14);
  });
});

describe('excludedText', () => {
  it('names only the groups that have sessions', () => {
    expect(excludedText(0, 0)).toBe('');
    expect(excludedText(0, 0, 1)).toBe(
      ' Not included: 1 session with a study group (live group sessions).',
    );
    expect(excludedText(1, 0)).toBe(
      ' Not included: 1 session with research interventions turned off.',
    );
    expect(excludedText(0, 2)).toBe(
      ' Not included: 2 sessions without a condition (from before research interventions were on).',
    );
    expect(excludedText(2, 1)).toContain(
      '2 sessions with research interventions turned off, 1 session without',
    );
  });
});
