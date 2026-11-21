import { describe, expect, it } from 'vitest';
import { NO_ATTEMPTS } from '../interventions/attempts';
import { NEW_SESSION_FIELDS } from '../sessions/session';
import type { CategoryRule } from '../categories/rules';
import { buildInsights } from '../insights/insights';
import { NO_COUNTS } from '../interventions/interstitial';
import type { FocusSession } from '../sessions/session';
import { memoryStore, type FullStore } from '../storage/activity-store';
import { asHistory } from '../storage/sessions-store';
import type { Segment } from '../tracker/tracker';
import {
  RETENTION_DAYS,
  asWeeklyTotals,
  isRetentionDue,
  mergeWeeklyTotals,
  oldestKeptDay,
  planRetention,
  runRetention,
  runRetentionIfDue,
} from './retention';

const MIN = 60_000;
/** Local time (passes in any time zone). Month is 1-based. */
const at = (month: number, day: number, h = 12, m = 0) =>
  new Date(2026, month - 1, day, h, m).getTime();
/** Fake clock: Wednesday, Nov 18, 2026, 3 pm. 30 days before = Mon Oct 19; 31 = Sun Oct 18. */
const NOW = at(11, 18, 15);

const rules: CategoryRule[] = [
  { domain: 'youtube.com', category: 'distraction' },
  { domain: 'wikipedia.org', category: 'study' },
];

const seg = (hostname: string, start: number, minutes: number): Segment => ({
  hostname,
  start,
  end: start + minutes * MIN,
});

function session(id: string, end: number, extra: Partial<FocusSession> = {}): FocusSession {
  return {
    id,
    goal: `Goal ${id}`,
    plannedMinutes: 25,
    start: end - 25 * MIN,
    plannedEnd: end,
    actualEnd: end,
    endedEarly: false,
    condition: 'friction',
    minutesByCategory: { study: 20, neutral: 0, distraction: 5 },
    distractionVisits: 2,
    checkIn: { goalCompleted: 'yes', focusRating: 4, answeredAt: end + MIN },
    ...NO_COUNTS,
    ...NO_ATTEMPTS,
    ...NEW_SESSION_FIELDS,
    frictionShown: 3,
    frictionContinued: 1,
    ...extra,
  };
}

function seeded(): FullStore & { data: Record<string, unknown> } {
  return memoryStore({
    'categories:rules': rules,
    // 31 days old (Sunday): rolled up into the week of Mon Oct 12.
    'activity:2026-10-18': [
      seg('en.wikipedia.org', at(10, 18, 9), 30),
      seg('m.youtube.com', at(10, 18, 10), 10),
      seg('youtube.com', at(10, 18, 11), 5),
      seg('example.com', at(10, 18, 12), 7),
    ],
    // Exactly 30 days old (Monday): kept.
    'activity:2026-10-19': [seg('youtube.com', at(10, 19, 9), 20)],
    // 40 days old.
    'activity:2026-10-09': [seg('wikipedia.org', at(10, 9, 9), 60)],
    'activity:2026-11-18': [seg('wikipedia.org', at(11, 18, 9), 15)],
    'sessions:history': [
      session('old', at(10, 18, 10)),
      session('edge', at(10, 19, 0, 5)), // ended 30 days ago (Oct 19): kept in full
      session('new', at(11, 17, 10)),
    ],
  });
}

const week = (t: { week: string; site: string; category: string; ms: number }) =>
  `${t.week} ${t.site} ${t.category} ${t.ms / MIN}`;

describe('retention schedule', () => {
  it('keeps 30 full days before today', () => {
    expect(RETENTION_DAYS).toBe(30);
    expect(oldestKeptDay(NOW)).toBe('2026-10-19');
    // Just after midnight the window moves by one day.
    expect(oldestKeptDay(at(11, 19, 0, 1))).toBe('2026-10-20');
    expect(oldestKeptDay(at(11, 18, 23, 59))).toBe('2026-10-19');
  });

  it('is due once per local day, and when never run or the clock went back', () => {
    expect(isRetentionDue(undefined, NOW)).toBe(true);
    expect(isRetentionDue('x', NOW)).toBe(true);
    expect(isRetentionDue(at(11, 18, 0, 1), NOW)).toBe(false);
    expect(isRetentionDue(at(11, 17, 23, 59), NOW)).toBe(true);
    expect(isRetentionDue(NOW + MIN, NOW)).toBe(true);
  });
});

describe('planRetention', () => {
  it('rolls days older than 30 days into weekly totals per site and category', () => {
    const store = seeded();
    const plan = planRetention(store.data, NOW);
    expect(plan.rolledDays).toEqual(['2026-10-09', '2026-10-18']);
    expect(plan.remove.sort()).toEqual(['activity:2026-10-09', 'activity:2026-10-18']);
    expect(asWeeklyTotals(plan.set['totals:weekly']).map(week)).toEqual([
      '2026-10-12 wikipedia.org study 30',
      '2026-10-12 youtube.com distraction 15', // m.youtube.com + youtube.com
      '2026-10-12 example.com neutral 7',
      '2026-10-05 wikipedia.org study 60',
    ]);
    // Buckets 30 days old and newer are untouched.
    expect(plan.set).not.toHaveProperty('activity:2026-10-19');
    expect(plan.remove).not.toContain('activity:2026-10-19');
  });

  it('exactly 30 days is kept; 31 days is rolled up', () => {
    const data = {
      'activity:2026-10-19': [seg('youtube.com', at(10, 19, 0, 0), 1)],
      'activity:2026-10-18': [seg('youtube.com', at(10, 18, 23, 58), 1)],
    };
    expect(planRetention(data, NOW).rolledDays).toEqual(['2026-10-18']);
  });

  it('splits a record that crosses midnight between weeks (Sunday → Monday)', () => {
    const data = {
      'categories:rules': rules,
      // Sun Oct 11, 23:50 → Mon Oct 12, 00:30.
      'activity:2026-10-11': [seg('youtube.com', at(10, 11, 23, 50), 40)],
    };
    expect(asWeeklyTotals(planRetention(data, NOW).set['totals:weekly']).map(week)).toEqual([
      '2026-10-12 youtube.com distraction 30',
      '2026-10-05 youtube.com distraction 10',
    ]);
  });

  it('counts the part of an old record that runs past midnight into a kept day once', () => {
    const data = {
      'categories:rules': rules,
      // Stored under Oct 18 (31 days), runs 20 min into Oct 19 (30 days, kept).
      'activity:2026-10-18': [seg('wikipedia.org', at(10, 18, 23, 50), 30)],
    };
    expect(asWeeklyTotals(planRetention(data, NOW).set['totals:weekly']).map(week)).toEqual([
      '2026-10-19 wikipedia.org study 20',
      '2026-10-12 wikipedia.org study 10',
    ]);
  });

  it('adds to existing weekly totals instead of replacing them', () => {
    const data = {
      'categories:rules': rules,
      'totals:weekly': [
        { week: '2026-10-12', site: 'youtube.com', category: 'distraction', ms: 5 * MIN },
      ],
      'activity:2026-10-16': [seg('youtube.com', at(10, 16, 9), 10)],
    };
    expect(asWeeklyTotals(planRetention(data, NOW).set['totals:weekly']).map(week)).toEqual([
      '2026-10-12 youtube.com distraction 15',
    ]);
  });

  it('keeps sessions; after 30 days drops only the goal text, keeping every number', () => {
    const store = seeded();
    const plan = planRetention(store.data, NOW);
    expect(plan.compactedSessions).toBe(1);
    const [old, edge, recent] = plan.set['sessions:history'] as Record<string, unknown>[];
    expect(old).toEqual({
      id: 'old',
      goal: '',
      compacted: true,
      plannedMinutes: 25,
      start: at(10, 18, 10) - 25 * MIN,
      plannedEnd: at(10, 18, 10),
      actualEnd: at(10, 18, 10),
      endedEarly: false,
      condition: 'friction',
      minutesByCategory: { study: 20, neutral: 0, distraction: 5 },
      distractionVisits: 2,
      checkIn: { goalCompleted: 'yes', focusRating: 4, answeredAt: at(10, 18, 10) + MIN },
      frictionShown: 3,
      frictionContinued: 1,
      frictionTurnedBack: 0,
      intentionShown: 0,
      intentionContinued: 0,
      intentionTurnedBack: 0,
      ...NO_ATTEMPTS,
      ...NEW_SESSION_FIELDS,
    });
    expect(edge).toMatchObject({ goal: 'Goal edge', frictionShown: 3 });
    expect(recent).toMatchObject({ goal: 'Goal new' });
    // A compacted session still loads with all its numbers.
    expect(asHistory([old])[0]).toMatchObject({
      id: 'old',
      goal: '',
      compacted: true,
      frictionShown: 3,
      frictionContinued: 1,
    });
  });

  it('after 30 days, distraction attempts keep their numbers but lose the site name (P13c)', () => {
    const attempts = [
      { site: 'youtube.com', at: 1, condition: 'friction', outcome: 'continued', dwellSeconds: 11 },
      { site: 'reddit.com', at: 2, condition: 'friction', outcome: null, dwellSeconds: null },
    ];
    const plan = planRetention(
      {
        'sessions:history': [
          session('old', at(10, 18, 10), {
            distractionAttempts: 2,
            attempts,
          } as Partial<FocusSession>),
        ],
      },
      NOW,
    );
    const [old] = plan.set['sessions:history'] as Record<string, unknown>[];
    expect(old).toMatchObject({ distractionAttempts: 2, compacted: true });
    expect(old?.attempts).toEqual([
      { at: 1, condition: 'friction', outcome: 'continued', dwellSeconds: 11 },
      { at: 2, condition: 'friction', outcome: null, dwellSeconds: null },
    ]);
    expect(JSON.stringify(plan.set)).not.toMatch(/youtube|reddit/);
  });

  it('only stamps the run time when there is nothing to do', () => {
    const plan = planRetention({ 'activity:2026-11-18': [seg('a.com', NOW - MIN, 1)] }, NOW);
    expect(plan).toEqual({
      set: { 'retention:last-run': NOW },
      remove: [],
      rolledDays: [],
      compactedSessions: 0,
    });
  });

  it('does not change the snapshot it was given', () => {
    const store = seeded();
    const copy = structuredClone(store.data);
    planRetention(store.data, NOW);
    expect(store.data).toEqual(copy);
  });
});

describe('runRetention', () => {
  it('writes totals, deletes the old raw records, and keeps everything newer', async () => {
    const store = seeded();
    await runRetention(store, NOW);
    expect(
      Object.keys(store.data)
        .filter((k) => k.startsWith('activity:'))
        .sort(),
    ).toEqual(['activity:2026-10-19', 'activity:2026-11-18']);
    expect(store.data['retention:last-run']).toBe(NOW);
    expect(asWeeklyTotals(store.data['totals:weekly'])).toHaveLength(4);
  });

  it('running twice changes nothing more (idempotent)', async () => {
    const store = seeded();
    await runRetention(store, NOW);
    const after = structuredClone(store.data);
    const second = await runRetention(store, NOW + MIN);
    expect(second.rolledDays).toEqual([]);
    expect(second.compactedSessions).toBe(0);
    expect(store.data).toEqual({ ...after, 'retention:last-run': NOW + MIN });
  });

  it('an interrupted run (suspended before the remove) loses and double-counts nothing', async () => {
    const reference = seeded();
    await runRetention(reference, NOW);

    const store = seeded();
    const failingRemove = {
      ...store,
      remove: () => Promise.reject(new Error('background suspended')),
    };
    await expect(runRetention(failingRemove, NOW)).rejects.toThrow('suspended');
    // Old buckets are now empty, totals are written once.
    expect(store.data['activity:2026-10-18']).toEqual([]);

    await runRetention(store, NOW);
    expect(store.data).toEqual(reference.data);
  });

  it('an interrupted run (suspended before the write) changes nothing', async () => {
    const store = seeded();
    const before = structuredClone(store.data);
    const failingSet = { ...store, set: () => Promise.reject(new Error('background suspended')) };
    await expect(runRetention(failingSet, NOW)).rejects.toThrow('suspended');
    expect(store.data).toEqual(before);
  });

  it('runs at most once per local day', async () => {
    const store = seeded();
    expect(await runRetentionIfDue(store, NOW)).not.toBeNull();
    expect(await runRetentionIfDue(store, at(11, 18, 23, 59))).toBeNull();
    // Next day: due again, and the Oct 19 bucket is now 31 days old.
    const next = await runRetentionIfDue(store, at(11, 19, 0, 1));
    expect(next?.rolledDays).toEqual(['2026-10-19']);
    expect(asWeeklyTotals(store.data['totals:weekly']).map(week)).toContain(
      '2026-10-19 youtube.com distraction 20',
    );
  });

  it('Insights shows the same numbers before and after the cleanup', async () => {
    const store = seeded();
    const before = buildInsights(store.data, NOW);
    await runRetention(store, NOW);
    expect(buildInsights(store.data, NOW)).toEqual(before);
  });
});

describe('mergeWeeklyTotals', () => {
  it('merges the same week + site + category and sorts newest week first', () => {
    const t = (week: string, site: string, ms: number) =>
      ({ week, site, category: 'study', ms }) as const;
    expect(
      mergeWeeklyTotals(
        [t('2026-10-05', 'a.org', 1)],
        [t('2026-10-12', 'a.org', 2), t('2026-10-05', 'a.org', 3)],
      ),
    ).toEqual([t('2026-10-12', 'a.org', 2), t('2026-10-05', 'a.org', 4)]);
  });
});
