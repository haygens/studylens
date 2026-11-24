/**
 * Passive study groups (P18): what members of a group may see about each other, and the rules
 * both the server (web/) and the extension agree on. See docs/backend.md.
 *
 * Only two things are ever shared, each behind its own per-group switch:
 * - **focus minutes**: one number per local date (minutes inside focus sessions), and
 * - **focusing now**: whether the member is in a focus session right now.
 * Never sites, domains, categories, goals, research conditions or check-in answers.
 */

/** A member's switches for one group. Both default to ON after the explanation shown on join. */
export interface GroupSharing {
  /** "Share my focus minutes": today's minutes and the 7-day history. */
  focusMinutes: boolean;
  /** "Show when I'm focusing": the "focusing now" badge. */
  focusingNow: boolean;
}

export const SHARING_OFF: GroupSharing = { focusMinutes: false, focusingNow: false };
export const SHARING_DEFAULT: GroupSharing = { focusMinutes: true, focusingNow: true };

/** A day has 1440 minutes; nobody focuses longer than that in one day. */
export const MAX_DAILY_FOCUS_MINUTES = 1440;
/** Daily totals are kept this many days on the server, then deleted by the daily cleanup. */
export const DAILY_TOTALS_KEEP_DAYS = 14;
/** The mini history shows this many days, ending today. */
export const HISTORY_DAYS = 7;
/** A POST /api/totals may update at most this many days (an offline queue catching up). */
export const MAX_TOTALS_DAYS_PER_REQUEST = HISTORY_DAYS;
/** "Focusing now" only while the last heartbeat is younger than this. */
export const PRESENCE_TTL_MS = 3 * 60_000;
/** The extension sends totals at most this often while a session runs. */
export const TOTALS_INTERVAL_MS = 5 * 60_000;
/** The Study groups page refreshes this often while it is open. */
export const OVERVIEW_REFRESH_MS = 60_000;

/** One local date (`YYYY-MM-DD`, the member's own calendar) and the focus minutes on it. */
export interface DailyTotal {
  localDate: string;
  focusMinutes: number;
}

/** POST /api/totals */
export interface TotalsRequest {
  days: DailyTotal[];
}

/**
 * `stored` = how many days were saved. 0 when none of my groups has "Share my focus minutes" on
 * (then the server keeps nothing and deletes what it had).
 */
export interface TotalsResponse {
  ok: true;
  stored: number;
}

export type PresenceState = 'start' | 'heartbeat' | 'stop';

/** POST /api/presence */
export interface PresenceRequest {
  state: PresenceState;
}

/** `focusing` = whether the server now shows me as focusing (false if no group shares it). */
export interface PresenceResponse {
  ok: true;
  focusing: boolean;
}

/** PATCH /api/groups/:id/sharing — only the switches given are changed. */
export interface UpdateSharingRequest {
  focusMinutes?: boolean;
  focusingNow?: boolean;
}

export interface UpdateSharingResponse {
  sharing: GroupSharing;
}

/** One member as the other members of the group see them. `null` = not shared. */
export interface OverviewMember {
  displayName: string;
  role: 'owner' | 'member';
  isMe: boolean;
  /** Minutes on the viewer's `today`, or null when the member doesn't share focus minutes. */
  todayMinutes: number | null;
  /** True while in a focus session (heartbeat < 3 min old); null when not shared. */
  focusingNow: boolean | null;
  /** `HISTORY_DAYS` entries, oldest first, ending on `today`; null when not shared. */
  history: DailyTotal[] | null;
}

/** GET /api/groups/:id/overview?today=YYYY-MM-DD */
export interface GroupOverviewResponse {
  group: { id: string; name: string };
  /** The date "today" refers to (the viewer's local date, or the server's UTC date). */
  today: string;
  /** Oldest member first. */
  members: OverviewMember[];
}

/** GET /api/groups/focusing — for the popup's "2 friends focusing now". */
export interface FocusingNowResponse {
  /** Other members (in any of my groups, each counted once) who are focusing and share it. */
  count: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isLocalDate(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Midnight UTC of a `YYYY-MM-DD` date, in epoch ms. */
export function dateToUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** `YYYY-MM-DD` of an epoch ms in UTC. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `2026-11-23` + 1 → `2026-11-24` (pure calendar arithmetic, no time zones). */
export function addDays(date: string, days: number): string {
  return utcDate(dateToUtcMs(date) + days * 86_400_000);
}

/** The `count` dates ending on `today`, oldest first. */
export function lastDates(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - count + 1));
}

/** `135` → `2 h 15 min`, `45` → `45 min`, `0` → `0 min`. */
export function formatFocusMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
