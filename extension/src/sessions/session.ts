/**
 * Focus session types and pure helpers (P4). No browser APIs here.
 *
 * The goal text is personal, so session records never leave the device (privacy rule 1).
 * Anything shared later (only after IRB approval) is built from `SessionSummary` in packages/shared, which has no goal
 * and no domains.
 */
import type { CheckIn, SessionCondition, SessionMode, SiteCategory } from '@studylens/shared';
import { NO_COUNTS, type InterventionCounts } from '../interventions/interstitial';
import { NO_ATTEMPTS, type AttemptFields } from '../interventions/attempts';

export const PRESET_MINUTES = [25, 50] as const;
export const MIN_CUSTOM_MINUTES = 5;
export const MAX_CUSTOM_MINUTES = 180;
export const MAX_GOAL_LENGTH = 200;

const MINUTE_MS = 60_000;

/**
 * The session that is running right now. At most one exists. The friction (P9) and intention
 * (P10) counts are updated while it runs and stay on the finished session (0 unless the condition
 * matches).
 */
export interface ActiveSession extends InterventionCounts, AttemptFields {
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
  /** P13c: `solo` for every session until group sessions exist (P18b). */
  mode: SessionMode;
  /**
   * P13c: session order on this device (1, 2, 3, …), given when the session starts. Null for
   * sessions from before v0.4.0 (their order is their position in the history).
   */
  sessionNumber: number | null;
  /** P13c: label-set version when the session started; null before v0.4.0. */
  labelSetVersion: number | null;
  /** P13c: true if study mode (labels locked) was on when the session started. */
  labelsLocked: boolean;
}

/** P13c fields as they are before the session is started (filled in by startSession). */
export const NEW_SESSION_FIELDS = {
  mode: 'solo',
  sessionNumber: null,
  labelSetVersion: null,
  labelsLocked: false,
} as const satisfies Pick<
  ActiveSession,
  'mode' | 'sessionNumber' | 'labelSetVersion' | 'labelsLocked'
>;

/** A finished session, as stored on the device. */
export interface FocusSession extends ActiveSession {
  /** Epoch milliseconds. Equals `plannedEnd` unless the session was ended early. */
  actualEnd: number;
  endedEarly: boolean;
  minutesByCategory: Record<SiteCategory, number>;
  distractionVisits: number;
  /** End-of-session check-in (P5). Null until it is answered or skipped. */
  checkIn: CheckIn | null;
  /**
   * Retention (P12): true once the session is more than 30 days old and its goal text was removed.
   * All numeric fields (including the friction/intention counts) are kept.
   */
  compacted?: true;
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

/**
 * `notice-unanswered`: research interventions are on and the one-time notice (Keep on / Turn off)
 * hasn't been answered yet. No session starts until it is.
 */
export type StartError =
  'already-running' | 'invalid-goal' | 'invalid-duration' | 'notice-unanswered';

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
      ...NO_COUNTS,
      ...NO_ATTEMPTS,
      ...NEW_SESSION_FIELDS,
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
    ...NO_COUNTS,
    ...NO_ATTEMPTS,
    ...NEW_SESSION_FIELDS,
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
