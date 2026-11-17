/**
 * Turns raw storage into readable table rows for the My Data page (P6). Pure: no browser APIs.
 * Times are shown in the user's local time zone.
 */
import type { CheckIn, SessionCondition, SiteCategory } from '@studylens/shared';
import type { CategoryRule } from '../categories/rules';
import type { ActiveSession, FocusSession } from '../sessions/session';
import { asSegments } from '../storage/activity-store';
import { asRules } from '../storage/categories-store';
import { STORAGE_KEYS, dayOfKey } from '../storage/keys';
import { asActiveSession, asHistory } from '../storage/sessions-store';

/** "9:05:03 AM" in local time (fixed format so it doesn't depend on browser locale). */
export function formatClock(time: number): string {
  const d = new Date(time);
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${h % 12 || 12}:${mm}:${ss} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Mon, Nov 16, 2026" for a local `YYYY-MM-DD` day, or for an epoch time. */
export function formatDay(day: string | number): string {
  const d =
    typeof day === 'number'
      ? new Date(day)
      : new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][d.getMonth()];
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "45s", "3m 05s", "1h 02m". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** "25 min", "0.4 min" (test sessions), "1.5 min". */
export function formatMinutes(minutes: number): string {
  return `${Math.round(minutes * 10) / 10} min`;
}

export interface ActivityRow {
  hostname: string;
  start: string;
  end: string;
  duration: string;
}

export interface ActivityDay {
  /** `2026-11-16` */
  day: string;
  label: string;
  rows: ActivityRow[];
  total: string;
}

/** Finished activity records grouped by local day, newest day first, earliest record first. */
export function activityByDay(stored: Record<string, unknown>): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (const [key, value] of Object.entries(stored)) {
    const day = dayOfKey(key);
    if (!day) continue;
    const segments = asSegments(value).sort((a, b) => a.start - b.start);
    if (segments.length === 0) continue;
    days.push({
      day,
      label: formatDay(day),
      rows: segments.map((s) => ({
        hostname: s.hostname,
        start: formatClock(s.start),
        end: formatClock(s.end),
        duration: formatDuration(s.end - s.start),
      })),
      total: formatDuration(segments.reduce((sum, s) => sum + (s.end - s.start), 0)),
    });
  }
  return days.sort((a, b) => b.day.localeCompare(a.day));
}

/** "Recording now: youtube.com since 2:03:04 PM", or null. */
export function recordingNow(stored: Record<string, unknown>): string | null {
  const state = stored[STORAGE_KEYS.trackerState] as
    { open?: { hostname?: unknown; start?: unknown } | null } | undefined;
  const open = state?.open;
  if (!open || typeof open.hostname !== 'string' || typeof open.start !== 'number') return null;
  return `${open.hostname} since ${formatClock(open.start)}`;
}

const SKIP_TEXT = {
  user: 'Skipped (you pressed Skip)',
  expired: 'Skipped (not answered within 12 hours)',
  'new-session': 'Skipped (a new session started first)',
} as const;

/** Check-in answers in words, including why it was skipped. */
export function describeCheckIn(checkIn: CheckIn | null): string {
  if (!checkIn) return 'Not answered yet';
  if ('skipped' in checkIn) return SKIP_TEXT[checkIn.reason];
  return `Goal finished: ${checkIn.goalCompleted} · Focus ${checkIn.focusRating}/5`;
}

const CONDITION_TEXT: Record<SessionCondition, string> = {
  control: 'Control (no intervention)',
  friction: 'Friction (short countdown)',
  intention: 'Intention ("What did you come here for?")',
  'opted-out': 'Opted out (research interventions off)',
};

/** The session's research condition in words. */
export function describeCondition(condition: SessionCondition | null): string {
  return condition ? CONDITION_TEXT[condition] : 'None (research interventions not active)';
}

export interface SessionRow {
  id: string;
  date: string;
  goal: string;
  planned: string;
  actual: string;
  minutes: Record<SiteCategory, string>;
  distractionVisits: number;
  checkIn: string;
  condition: string;
}

/** Finished sessions, newest first. */
export function sessionRows(stored: Record<string, unknown>): SessionRow[] {
  return asHistory(stored[STORAGE_KEYS.sessionHistory])
    .map((s: FocusSession) => ({
      id: s.id,
      date: `${formatDay(s.start)} ${formatClock(s.start)}`,
      goal: s.goal,
      planned: formatMinutes(s.plannedMinutes),
      actual:
        formatMinutes((s.actualEnd - s.start) / 60_000) + (s.endedEarly ? ' (ended early)' : ''),
      minutes: {
        study: formatMinutes(s.minutesByCategory.study),
        neutral: formatMinutes(s.minutesByCategory.neutral),
        distraction: formatMinutes(s.minutesByCategory.distraction),
      },
      distractionVisits: s.distractionVisits,
      checkIn: describeCheckIn(s.checkIn),
      condition: describeCondition(s.condition),
    }))
    .reverse();
}

export function activeSession(stored: Record<string, unknown>): ActiveSession | null {
  return asActiveSession(stored[STORAGE_KEYS.activeSession]);
}

export function siteLabels(stored: Record<string, unknown>): CategoryRule[] {
  return asRules(stored[STORAGE_KEYS.categoryRules]);
}
