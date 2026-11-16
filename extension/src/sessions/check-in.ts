/**
 * End-of-session check-in (P5): pure rules, no browser APIs.
 *
 * A finished session's `checkIn` is null until it is answered or skipped. Only the most recent
 * finished session can be pending; older unanswered ones are skipped automatically, and so is the
 * latest one after CHECK_IN_EXPIRY_MS or when a new session starts. Answers stay on the device.
 */
import {
  isFocusRating,
  isGoalCompleted,
  type CheckIn,
  type FocusRating,
  type GoalCompleted,
  type SkipReason,
} from '@studylens/shared';
import type { ActiveSession, FocusSession } from './session';

export const CHECK_IN_EXPIRY_MS = 12 * 60 * 60 * 1000;

export const GOAL_LABELS: Record<GoalCompleted, string> = {
  yes: 'Yes',
  partly: 'Partly',
  no: 'No',
};

export const FOCUS_LABELS: Record<FocusRating, string> = {
  1: 'very distracted',
  2: 'mostly distracted',
  3: 'somewhat focused',
  4: 'mostly focused',
  5: 'fully focused',
};

function isExpired(session: FocusSession, now: number): boolean {
  return now - session.actualEnd >= CHECK_IN_EXPIRY_MS;
}

/**
 * The session whose check-in should be shown, or null. Only the latest finished session, only
 * while no session is running, and only until it expires.
 */
export function pendingCheckIn(
  history: readonly FocusSession[],
  active: ActiveSession | null,
  now: number,
): FocusSession | null {
  if (active) return null;
  const last = history.at(-1);
  if (!last || last.checkIn !== null || isExpired(last, now)) return null;
  return last;
}

/** Toolbar badge while no session runs: "?" when a check-in is waiting, otherwise empty. */
export function checkInBadge(
  history: readonly FocusSession[],
  active: ActiveSession | null,
  now: number,
): string {
  return pendingCheckIn(history, active, now) ? '?' : '';
}

/**
 * Marks unanswered check-ins as skipped where the rules say so:
 * - any unanswered session that is not the latest (a newer session exists) → `new-session`
 * - the latest, when `newSessionStarting` → `new-session`
 * - the latest, once CHECK_IN_EXPIRY_MS has passed since it ended → `expired`
 *
 * Returns the updated history, or null when nothing changed (so callers can skip the write).
 */
export function applyAutoSkips(
  history: readonly FocusSession[],
  now: number,
  newSessionStarting: boolean,
): FocusSession[] | null {
  let changed = false;
  const lastIndex = history.length - 1;
  const updated = history.map((session, i) => {
    if (session.checkIn !== null) return session;
    let reason: SkipReason | null = null;
    if (i < lastIndex || newSessionStarting) reason = 'new-session';
    else if (isExpired(session, now)) reason = 'expired';
    if (!reason) return session;
    changed = true;
    return { ...session, checkIn: { skipped: true, reason, answeredAt: now } as const };
  });
  return changed ? updated : null;
}

export type CheckInInput =
  { kind: 'answer'; goalCompleted: unknown; focusRating: unknown } | { kind: 'skip' };

/** Validates what the popup sent and stamps it. Null if the answer is not valid. */
export function toCheckIn(input: CheckInInput, now: number): CheckIn | null {
  if (input.kind === 'skip') return { skipped: true, reason: 'user', answeredAt: now };
  const { goalCompleted, focusRating } = input;
  if (!isGoalCompleted(goalCompleted) || !isFocusRating(focusRating)) return null;
  return { goalCompleted, focusRating, answeredAt: now };
}

export type CheckInError = 'not-pending' | 'invalid-answer';

/**
 * Saves a check-in on `sessionId`, which must be the session currently pending. Returns the new
 * history, or an error (e.g. it was already answered in another popup, or it expired).
 */
export function recordCheckIn(
  history: readonly FocusSession[],
  sessionId: string,
  input: CheckInInput,
  now: number,
): FocusSession[] | CheckInError {
  const pending = pendingCheckIn(history, null, now);
  if (!pending || pending.id !== sessionId) return 'not-pending';
  const checkIn = toCheckIn(input, now);
  if (!checkIn) return 'invalid-answer';
  return history.map((s) => (s.id === sessionId ? { ...s, checkIn } : s));
}

/** "Finished: partly · Focus 4/5", "Check-in skipped", or "" if not answered yet. */
export function formatCheckIn(checkIn: CheckIn | null): string {
  if (!checkIn) return '';
  if ('skipped' in checkIn) return 'Check-in skipped';
  return `Finished: ${checkIn.goalCompleted} · Focus ${checkIn.focusRating}/5`;
}
