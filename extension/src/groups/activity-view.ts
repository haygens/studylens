/**
 * Passive study groups (P18): pure helpers for showing members' focus activity — the live preview
 * of what others see, the 7-day strip's text, and the popup line. No browser APIs.
 */
import {
  HISTORY_DAYS,
  formatFocusMinutes,
  lastDates,
  type DailyTotal,
  type GroupSharing,
  type OverviewMember,
} from '@studylens/shared';

/**
 * Exactly what the other members of a group will see about me with these switches, built from
 * this browser's own data (the same numbers the extension sends).
 */
export function previewMember(
  displayName: string,
  sharing: GroupSharing,
  minutesByDate: ReadonlyMap<string, number>,
  focusingNow: boolean,
  today: string,
): OverviewMember {
  const history: DailyTotal[] | null = sharing.focusMinutes
    ? lastDates(today, HISTORY_DAYS).map((localDate) => ({
        localDate,
        focusMinutes: minutesByDate.get(localDate) ?? 0,
      }))
    : null;
  return {
    displayName,
    role: 'member',
    isMe: true,
    todayMinutes: history ? history[history.length - 1]!.focusMinutes : null,
    focusingNow: sharing.focusingNow ? focusingNow : null,
    history,
  };
}

/** "45 min focused today" / "Focus minutes not shared". */
export function todayText(m: Pick<OverviewMember, 'todayMinutes'>): string {
  return m.todayMinutes === null
    ? 'Focus minutes not shared'
    : `${formatFocusMinutes(m.todayMinutes)} focused today`;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

/** `2026-11-24` → `Tue` (the date is a calendar date, so it is read in UTC on purpose). */
export function weekdayOf(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return WEEKDAY.format(new Date(Date.UTC(y, m - 1, d)));
}

/** The 7-day strip for screen readers: "Last 7 days: Wed 0 min, …, today 45 min". */
export function historyLabel(history: readonly DailyTotal[]): string {
  const parts = history.map(
    (d, i) =>
      `${i === history.length - 1 ? 'today' : weekdayOf(d.localDate)} ${formatFocusMinutes(d.focusMinutes)}`,
  );
  return `Last ${history.length} days: ${parts.join(', ')}`;
}

/** Bar heights as a share of the week's best day (0–1); all 0 when nothing was focused. */
export function barHeights(history: readonly DailyTotal[]): number[] {
  const max = Math.max(0, ...history.map((d) => d.focusMinutes));
  return history.map((d) => (max === 0 ? 0 : d.focusMinutes / max));
}

/** The popup line, or null when nobody is focusing. */
export function friendsFocusingText(count: number | null): string | null {
  if (count === null || count < 1) return null;
  return count === 1 ? '1 friend focusing now' : `${count} friends focusing now`;
}

/** A member as a group card lists them: the overview's view when loaded, else the plain list. */
export interface CardMember {
  displayName: string;
  role: 'owner' | 'member';
  isMe: boolean;
  /** Null until the overview has loaded (then the row shows activity). */
  activity: OverviewMember | null;
}

/**
 * The members a group card shows. The count ("Members (N of 20)") and the rows must come from this
 * same list: the overview refreshes every 60 s, the group list doesn't, so mixing them made the
 * count stale (hs's manual test, 2026-11-23).
 */
export function cardMembers(
  listed: readonly { displayName: string; role: 'owner' | 'member'; isMe: boolean }[],
  overview: readonly OverviewMember[] | null,
): CardMember[] {
  if (overview) {
    return overview.map((m) => ({
      displayName: m.displayName,
      role: m.role,
      isMe: m.isMe,
      activity: m,
    }));
  }
  return listed.map((m) => ({ ...m, activity: null }));
}

/**
 * The newest known focus minutes per date: this browser's own count or what the server has,
 * whichever is higher (a day's minutes only grow; each side updates on its own schedule). Used for
 * both my row and the "Others in this group see" preview, so they always agree.
 */
export function latestMinutes(
  local: ReadonlyMap<string, number>,
  server: OverviewMember | null | undefined,
): Map<string, number> {
  const out = new Map(local);
  for (const d of server?.history ?? []) {
    out.set(d.localDate, Math.max(out.get(d.localDate) ?? 0, d.focusMinutes));
  }
  return out;
}

/** My row with the newest known minutes (only where minutes are shared). */
export function withLatestMinutes(
  member: OverviewMember,
  latest: ReadonlyMap<string, number>,
): OverviewMember {
  if (!member.history) return member;
  const history = member.history.map((d) => ({
    localDate: d.localDate,
    focusMinutes: Math.max(d.focusMinutes, latest.get(d.localDate) ?? 0),
  }));
  return { ...member, history, todayMinutes: history[history.length - 1]!.focusMinutes };
}
