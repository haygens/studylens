/**
 * Local dashboard numbers for the Insights tab (P11). Pure: no browser APIs, and nothing here is
 * sent anywhere. Built from the same storage snapshot the My Data page reads.
 *
 * Days are local calendar days. Sessions and activity records that cross local midnight are split
 * at midnight, so each part counts toward its own day (records are stored under the day they
 * started; this fixes the P2 note for these charts).
 */
import {
  GOAL_COMPLETED_VALUES,
  INTERVENTION_IDS,
  OPTED_OUT,
  type CheckIn,
  type FocusRating,
  type GoalCompleted,
  type InterventionId,
  type SiteCategory,
} from '@studylens/shared';
import { categoryOf, type CategoryRule } from '../categories/rules';
import type { FocusSession } from '../sessions/session';
import { asSegments } from '../storage/activity-store';
import { asRules } from '../storage/categories-store';
import { ACTIVITY_DAY_PREFIX, STORAGE_KEYS } from '../storage/keys';
import { asHistory } from '../storage/sessions-store';
import { localDayId, splitAtLocalMidnight } from '../tracker/local-day';
import { startOfLocalDay } from '../tracker/totals';
import type { Segment } from '../tracker/tracker';

/** Days shown in the trend charts, including today. */
export const TREND_DAYS = 14;
/** A condition needs at least this many sessions before its averages are shown. */
export const MIN_SESSIONS_PER_CONDITION = 3;

const MINUTE_MS = 60_000;

export { localDayId, nextLocalDay, splitAtLocalMidnight } from '../tracker/local-day';

/** Local day ids for the last `count` days, oldest first, ending with the day of `now`. */
export function lastDays(now: number, count: number): string[] {
  const days: string[] = [];
  const d = new Date(startOfLocalDay(now));
  for (let i = 0; i < count; i++) {
    days.unshift(localDayId(d.getTime()));
    d.setDate(d.getDate() - 1);
  }
  return days;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface DayTotals {
  /** Local day, `YYYY-MM-DD`. */
  day: string;
  /** Minutes inside finished focus sessions (start to actual end), rounded to 0.1. */
  focusMinutes: number;
  /** Tracked active minutes on Study / Distraction sites that day (in or out of sessions). */
  studyMinutes: number;
  distractionMinutes: number;
}

/** Per-day focus-session minutes and study/distraction minutes for the last `count` days. */
export function dailyTotals(
  sessions: readonly FocusSession[],
  segments: readonly Segment[],
  rules: readonly CategoryRule[],
  now: number,
  count = TREND_DAYS,
): DayTotals[] {
  const ms = new Map(
    lastDays(now, count).map((day) => [day, { focus: 0, study: 0, distraction: 0 }]),
  );
  for (const s of sessions) {
    for (const part of splitAtLocalMidnight(s.start, s.actualEnd)) {
      const totals = ms.get(part.day);
      if (totals) totals.focus += part.end - part.start;
    }
  }
  for (const seg of segments) {
    const category: SiteCategory = categoryOf(seg.hostname, rules);
    if (category === 'neutral') continue;
    for (const part of splitAtLocalMidnight(seg.start, seg.end)) {
      const totals = ms.get(part.day);
      if (totals) totals[category] += part.end - part.start;
    }
  }
  return [...ms].map(([day, t]) => ({
    day,
    focusMinutes: round1(t.focus / MINUTE_MS),
    studyMinutes: round1(t.study / MINUTE_MS),
    distractionMinutes: round1(t.distraction / MINUTE_MS),
  }));
}

export type HourBand = 'morning' | 'afternoon' | 'evening' | 'night';

/** Local-time bands, by the hour a session started. Night wraps past midnight. */
export const HOUR_BANDS: { id: HourBand; label: string; hours: string }[] = [
  { id: 'morning', label: 'Morning', hours: '5 am – noon' },
  { id: 'afternoon', label: 'Afternoon', hours: 'noon – 5 pm' },
  { id: 'evening', label: 'Evening', hours: '5 pm – 10 pm' },
  { id: 'night', label: 'Night', hours: '10 pm – 5 am' },
];

export function hourBandOf(time: number): HourBand {
  const h = new Date(time).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

type Answered = Extract<CheckIn, { focusRating: FocusRating }>;

function answered(s: FocusSession): Answered | null {
  return s.checkIn && 'focusRating' in s.checkIn ? s.checkIn : null;
}

export interface BandRating {
  band: HourBand;
  label: string;
  hours: string;
  /** Sessions in this band with an answered check-in. */
  ratedSessions: number;
  /** Average self-rated focus (1–5, one decimal), or null with no rated sessions. */
  averageRating: number | null;
}

/** Average self-rated focus by the time of day sessions started (answered check-ins only). */
export function focusByTimeOfDay(sessions: readonly FocusSession[]): BandRating[] {
  return HOUR_BANDS.map(({ id, label, hours }) => {
    const ratings = sessions
      .filter((s) => hourBandOf(s.start) === id)
      .flatMap((s) => answered(s)?.focusRating ?? []);
    return {
      band: id,
      label,
      hours,
      ratedSessions: ratings.length,
      averageRating: ratings.length ? round1(average(ratings)) : null,
    };
  });
}

function average(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface ConditionRow {
  condition: InterventionId;
  sessions: number;
  /** False when there are fewer than MIN_SESSIONS_PER_CONDITION sessions: show no averages. */
  enoughData: boolean;
  /** One decimal; null when there isn't enough data. */
  averageVisits: number | null;
  averageDistractionMinutes: number | null;
  /** Sessions with an answered check-in (rating and goal). */
  answeredSessions: number;
  averageRating: number | null;
  /** Whole percentages of answered sessions; null without enough data or answers. */
  goalPercent: Record<GoalCompleted, number> | null;
  goalCounts: Record<GoalCompleted, number>;
}

/**
 * Descriptive per-condition numbers (no significance test). Only randomized sessions count:
 * opted-out sessions and sessions without a condition (v0.1, or the feature switched off) are
 * left out and only counted in `excluded`.
 */
export function conditionComparison(sessions: readonly FocusSession[]): {
  rows: ConditionRow[];
  excluded: { optedOut: number; noCondition: number; group: number };
} {
  const rows = INTERVENTION_IDS.map((condition): ConditionRow => {
    const group = sessions.filter((s) => s.condition === condition);
    const enoughData = group.length >= MIN_SESSIONS_PER_CONDITION;
    const answers = group.flatMap((s) => answered(s) ?? []);
    const goalCounts = Object.fromEntries(
      GOAL_COMPLETED_VALUES.map((g) => [g, answers.filter((a) => a.goalCompleted === g).length]),
    ) as Record<GoalCompleted, number>;
    const show = <T>(value: () => T): T | null => (enoughData ? value() : null);
    return {
      condition,
      sessions: group.length,
      enoughData,
      averageVisits: show(() => round1(average(group.map((s) => s.distractionVisits)))),
      averageDistractionMinutes: show(() =>
        round1(average(group.map((s) => s.minutesByCategory.distraction))),
      ),
      answeredSessions: answers.length,
      averageRating:
        enoughData && answers.length ? round1(average(answers.map((a) => a.focusRating))) : null,
      goalPercent:
        enoughData && answers.length
          ? (Object.fromEntries(
              GOAL_COMPLETED_VALUES.map((g) => [
                g,
                Math.round((goalCounts[g] / answers.length) * 100),
              ]),
            ) as Record<GoalCompleted, number>)
          : null,
      goalCounts,
    };
  });
  return {
    rows,
    excluded: {
      optedOut: sessions.filter((s) => s.condition === OPTED_OUT).length,
      noCondition: sessions.filter((s) => s.condition === null).length,
      // P18b: live group sessions are never randomized and not part of the comparison.
      group: sessions.filter((s) => s.mode === 'group').length,
    },
  };
}

const sessions = (n: number) => `${n} session${n === 1 ? '' : 's'}`;

/** " Not included: …" naming only the groups that have sessions, or '' if none. */
export function excludedText(optedOut: number, noCondition: number, group = 0): string {
  const parts = [
    group > 0 && `${sessions(group)} with a study group (live group sessions)`,
    optedOut > 0 && `${sessions(optedOut)} with research interventions turned off`,
    noCondition > 0 &&
      `${sessions(noCondition)} without a condition (from before research interventions were on)`,
  ].filter(Boolean);
  return parts.length ? ` Not included: ${parts.join(', ')}.` : '';
}

export interface Insights {
  days: DayTotals[];
  timeOfDay: BandRating[];
  conditions: ReturnType<typeof conditionComparison>;
  /** All finished sessions stored. */
  totalSessions: number;
}

/** Everything the Insights tab shows, from a full storage snapshot. */
export function buildInsights(stored: Record<string, unknown>, now: number): Insights {
  const sessions = asHistory(stored[STORAGE_KEYS.sessionHistory]);
  const rules = asRules(stored[STORAGE_KEYS.categoryRules]);
  const segments = Object.entries(stored)
    .filter(([key]) => key.startsWith(ACTIVITY_DAY_PREFIX))
    .flatMap(([, value]) => asSegments(value));
  return {
    days: dailyTotals(sessions, segments, rules, now),
    timeOfDay: focusByTimeOfDay(sessions),
    conditions: conditionComparison(sessions),
    totalSessions: sessions.length,
  };
}
