/**
 * Local calendar-day helpers shared by Insights (P11) and retention (P12). DST-safe: days can be
 * 23 or 25 hours long, so day steps use `setDate`, never a fixed 24 h.
 */
import { startOfLocalDay } from './totals';

/** Start of the next local day. */
export function nextLocalDay(dayStart: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** `2026-11-16` for the local day containing `time`. */
export function localDayId(time: number): string {
  const d = new Date(time);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Local day id `days` calendar days before (negative: after) the day containing `time`. */
export function localDayIdBefore(time: number, days: number): string {
  const d = new Date(startOfLocalDay(time));
  d.setDate(d.getDate() - days);
  return localDayId(d.getTime());
}

/** Local day id of the Monday that starts the week containing `time`. */
export function localWeekStartId(time: number): string {
  const d = new Date(startOfLocalDay(time));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDayId(d.getTime());
}

/** Splits [start, end) at every local midnight it crosses. Empty for end <= start. */
export function splitAtLocalMidnight(
  start: number,
  end: number,
): { day: string; start: number; end: number }[] {
  const parts: { day: string; start: number; end: number }[] = [];
  let t = start;
  while (t < end) {
    const stop = Math.min(end, nextLocalDay(startOfLocalDay(t)));
    parts.push({ day: localDayId(t), start: t, end: stop });
    t = stop;
  }
  return parts;
}
