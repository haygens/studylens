/**
 * Focus session types and pure helpers (P4). No browser APIs here.
 *
 * The goal text is personal, so session records never leave the device (privacy rule 1).
 * Anything shared later (P17) is built from `SessionSummary` in packages/shared, which has no goal
 * and no domains.
 */
import type { CheckIn, SessionCondition, SiteCategory } from '@studylens/shared';

export const PRESET_MINUTES = [25, 50] as const;
export const MIN_CUSTOM_MINUTES = 5;
export const MAX_CUSTOM_MINUTES = 180;
export const MAX_GOAL_LENGTH = 200;

const MINUTE_MS = 60_000;

/** The session that is running right now. At most one exists. */
export interface ActiveSession {
  id: string;
  goal: string;
  plannedMinutes: number;
  /** Epoch milliseconds. */
  start: number;
  /** Epoch milliseconds: start + plannedMinutes. */
  plannedEnd: number;
  /**
   * Research condition, assigned when the session starts (P8) and kept if it ends early. Null when
   * research interventions are switched off (feature flag) or the session is from v0.1.
   * Never shown when starting a session; My Data shows it.
   */
  condition: SessionCondition | null;
}

/** A finished session, as stored on the device. */
export interface FocusSession extends ActiveSession {
  /** Epoch milliseconds. Equals `plannedEnd` unless the session was ended early. */
  actualEnd: number;
  endedEarly: boolean;
  minutesByCategory: Record<SiteCategory, number>;
  distractionVisits: number;
  /** End-of-session check-in (P5). Null until it is answered or skipped. */
  checkIn: CheckIn | null;
}

/** Cleans the goal text; null if it is empty. */
export function normalizeGoal(input: string): string | null {
  const goal = input.trim().replace(/\s+/g, ' ').slice(0, MAX_GOAL_LENGTH);
  return goal || null;
}

/** True for a whole number of minutes in the allowed range (covers the presets too). */
export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) && minutes >= MIN_CUSTOM_MINUTES && minutes <= MAX_CUSTOM_MINUTES
  );
}

export type StartError = 'already-running' | 'invalid-goal' | 'invalid-duration';

/**
 * `testSeconds` (E2E test build only, see src/e2e/test-seconds.ts) replaces `minutes` with a
 * length in seconds. Normal builds always pass null.
 */
export function createSession(
  goalInput: string,
  minutes: number,
  now: number,
  id: string,
  testSeconds: number | null = null,
): ActiveSession | StartError {
  const goal = normalizeGoal(goalInput);
  if (!goal) return 'invalid-goal';
  if (testSeconds !== null) {
    return {
      id,
      goal,
      plannedMinutes: testSeconds / 60,
      start: now,
      plannedEnd: now + testSeconds * 1000,
      condition: null,
    };
  }
  if (!isValidDuration(minutes)) return 'invalid-duration';
  return {
    id,
    goal,
    plannedMinutes: minutes,
    start: now,
    plannedEnd: now + minutes * MINUTE_MS,
    condition: null,
  };
}

export function remainingMs(session: ActiveSession, now: number): number {
  return Math.max(0, session.plannedEnd - now);
}

export function isDue(session: ActiveSession, now: number): boolean {
  return now >= session.plannedEnd;
}

/** Whole minutes left, rounded up, for the toolbar badge ("25", …, "1"). */
export function badgeText(session: ActiveSession | null, now: number): string {
  if (!session) return '';
  const ms = remainingMs(session, now);
  return ms > 0 ? String(Math.ceil(ms / MINUTE_MS)) : '';
}

/** "24:59" / "1:02:03" for the popup countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
