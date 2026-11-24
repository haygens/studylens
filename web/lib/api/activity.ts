/**
 * Passive study groups (P18): validation of what the extension may send, including plausibility
 * checks ("reject impossible values"). The server doesn't know a member's time zone, so the checks
 * use the widest possible range: local dates run from UTC−12 to UTC+14.
 */
import {
  HISTORY_DAYS,
  MAX_DAILY_FOCUS_MINUTES,
  MAX_TOTALS_DAYS_PER_REQUEST,
  addDays,
  dateToUtcMs,
  isLocalDate,
  utcDate,
  type DailyTotal,
} from '@studylens/shared';
import { z } from 'zod';
import { ApiError } from './errors';

const HOUR = 3_600_000;
/** The earliest a local date can begin, relative to its UTC midnight (UTC+14). */
const EARLIEST_START_OFFSET_MS = 14 * HOUR;

export const localDateSchema = z.string().refine(isLocalDate, 'Expected a date like 2026-11-23.');

export const sharingSchema = z.strictObject({
  focusMinutes: z.boolean(),
  focusingNow: z.boolean(),
});

export const updateSharingSchema = z
  .strictObject({
    focusMinutes: z.boolean().optional(),
    focusingNow: z.boolean().optional(),
  })
  .refine((v) => v.focusMinutes !== undefined || v.focusingNow !== undefined, {
    message: 'Give focusMinutes and/or focusingNow.',
  });

export const totalsSchema = z.strictObject({
  days: z
    .array(
      z.strictObject({
        localDate: localDateSchema,
        focusMinutes: z.number().int().min(0).max(MAX_DAILY_FOCUS_MINUTES),
      }),
    )
    .min(1)
    .max(MAX_TOTALS_DAYS_PER_REQUEST)
    .refine((days) => new Set(days.map((d) => d.localDate)).size === days.length, {
      message: 'Each date may appear only once.',
    }),
});

export const presenceSchema = z.strictObject({
  state: z.enum(['start', 'heartbeat', 'stop']),
});

/** Why a day's total is impossible at `now`, or null if it could be real. */
export function implausibleTotal(day: DailyTotal, now: number): string | null {
  const earliestStart = dateToUtcMs(day.localDate) - EARLIEST_START_OFFSET_MS;
  if (earliestStart > now) return 'This date hasn’t started anywhere yet.';
  if (day.localDate < addDays(utcDate(now), -HISTORY_DAYS)) {
    return `Only the last ${HISTORY_DAYS} days can be updated.`;
  }
  const passed = Math.floor((now - earliestStart) / 60_000);
  if (day.focusMinutes > Math.min(MAX_DAILY_FOCUS_MINUTES, passed)) {
    return 'More focus minutes than have passed on this date.';
  }
  return null;
}

/** Throws 400 `validation_failed` if any day is impossible. */
export function assertPlausibleTotals(days: DailyTotal[], now: number): void {
  const details = days.flatMap((day, i) => {
    const problem = implausibleTotal(day, now);
    return problem ? [{ path: `days.${i}`, message: problem }] : [];
  });
  if (details.length > 0) {
    throw new ApiError(400, 'validation_failed', 'Some focus totals are impossible.', details);
  }
}

/**
 * The `today` of an overview request: the viewer's local date (it can be at most one day away
 * from the server's UTC date), or the server's UTC date when not given.
 */
export function overviewToday(param: string | null, now: number): string {
  const utc = utcDate(now);
  if (param === null || param === '') return utc;
  if (!isLocalDate(param) || param < addDays(utc, -1) || param > addDays(utc, 1)) {
    throw new ApiError(400, 'validation_failed', 'Some fields are missing or invalid.', [
      { path: 'today', message: 'Expected your local date, like 2026-11-23.' },
    ]);
  }
  return param;
}
