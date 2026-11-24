/**
 * Builds the group overview (P18) from plain rows, shared by the SQL and in-memory `Db`s so both
 * apply the sharing rules the same way. Device IDs are used only to match rows here; they never
 * leave the server.
 */
import { addDays, lastDates, type GroupRole, type OverviewMember } from '@studylens/shared';
import type { OverviewQuery } from './types';

export interface OverviewMemberRow {
  deviceId: string;
  displayName: string;
  role: GroupRole;
  isMe: boolean;
  shareMinutes: boolean;
  sharePresence: boolean;
  /** Has a presence row that hasn't expired at `q.now`. */
  focusing: boolean;
}

export interface OverviewTotalRow {
  deviceId: string;
  localDate: string;
  focusMinutes: number;
}

/** The first date the history covers. */
export const historyStart = (q: OverviewQuery) => addDays(q.today, 1 - q.historyDays);

export function buildOverviewMembers(
  members: OverviewMemberRow[],
  totals: OverviewTotalRow[],
  q: OverviewQuery,
): OverviewMember[] {
  const dates = lastDates(q.today, q.historyDays);
  return members.map((m) => {
    let history: OverviewMember['history'] = null;
    if (m.shareMinutes) {
      const mine = new Map(
        totals.filter((t) => t.deviceId === m.deviceId).map((t) => [t.localDate, t.focusMinutes]),
      );
      history = dates.map((localDate) => ({ localDate, focusMinutes: mine.get(localDate) ?? 0 }));
    }
    return {
      displayName: m.displayName,
      role: m.role,
      isMe: m.isMe,
      todayMinutes: history ? history[history.length - 1]!.focusMinutes : null,
      focusingNow: m.sharePresence ? m.focusing : null,
      history,
    };
  });
}
