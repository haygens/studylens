/**
 * Distraction attempts (P13c), pure logic. No browser APIs here.
 *
 * An attempt is logged at the exact moment the friction/intention page would appear — in EVERY
 * research condition, including control (where nothing is shown and the site simply loads). That
 * makes attempts comparable across conditions, unlike "distraction visits", which interventions
 * can change by sending the tab away.
 *
 * Privacy: an attempt holds the site group (registrable domain or labeled subdomain, as used for
 * labels), a time, the condition, the outcome and the helper-page dwell time. Never a URL, and never
 * what the user typed. Retention (P12) removes the site name after 30 days.
 */
import type { AttemptOutcome, InterventionId } from '@studylens/shared';
import { isAttemptOutcome, isInterventionId } from '@studylens/shared';

export interface DistractionAttempt {
  /** Site group (e.g. `youtube.com`). Removed by retention after 30 days. */
  site?: string;
  /** Epoch ms when the attempt happened (when the helper page was opened). */
  at: number;
  condition: InterventionId;
  /**
   * `visited` (control), `continued` / `turned_back` (friction, intention), or null when the helper
   * page was shown but no choice was recorded (e.g. the tab was closed).
   */
  outcome: AttemptOutcome | null;
  /** Friction/intention: seconds the helper page was open before the choice (0.1 s). */
  dwellSeconds: number | null;
}

/** Attempts fields stored on every session from v0.4.0. */
export interface AttemptFields {
  /**
   * Number of distraction attempts. Keeps counting past MAX_ATTEMPT_LOG. Null for sessions from
   * before v0.4.0, which didn't log attempts.
   */
  distractionAttempts: number | null;
  /** Compact per-attempt list, at most MAX_ATTEMPT_LOG entries (oldest kept). */
  attempts: DistractionAttempt[];
}

/** The per-session list stops growing here; the count keeps going. */
export const MAX_ATTEMPT_LOG = 200;

export const NO_ATTEMPTS: AttemptFields = { distractionAttempts: 0, attempts: [] };

/** Logs one attempt. Control attempts are complete right away (`visited`). */
export function logAttempt<T extends AttemptFields>(
  session: T,
  site: string,
  condition: InterventionId,
  now: number,
): T {
  const attempt: DistractionAttempt = {
    site,
    at: now,
    condition,
    outcome: condition === 'control' ? 'visited' : null,
    dwellSeconds: null,
  };
  const list =
    session.attempts.length < MAX_ATTEMPT_LOG ? [...session.attempts, attempt] : session.attempts;
  return {
    ...session,
    distractionAttempts: (session.distractionAttempts ?? 0) + 1,
    attempts: list,
  };
}

/** Seconds between two epoch-ms times, to 0.1 s, never negative. */
export function dwellSeconds(from: number, to: number): number {
  return Math.round(Math.max(0, to - from) / 100) / 10;
}

/**
 * Records Continue / Back on the latest open attempt for `site` (outcome still null), with the
 * dwell time. Unchanged if there is no such attempt (e.g. the list was full).
 */
export function resolveAttempt<T extends AttemptFields>(
  session: T,
  site: string,
  choice: 'continue' | 'back',
  now: number,
): T {
  let index = -1;
  for (let i = session.attempts.length - 1; i >= 0; i--) {
    const a = session.attempts[i];
    if (a && a.outcome === null && a.site === site) {
      index = i;
      break;
    }
  }
  if (index < 0) return session;
  const attempts = session.attempts.map((a, i) =>
    i === index
      ? {
          ...a,
          outcome: choice === 'continue' ? ('continued' as const) : ('turned_back' as const),
          dwellSeconds: dwellSeconds(a.at, now),
        }
      : a,
  );
  return { ...session, attempts };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Stored attempts, dropping anything malformed. */
export function asAttempts(value: unknown): DistractionAttempt[] {
  if (!Array.isArray(value)) return [];
  const out: DistractionAttempt[] = [];
  for (const item of value.slice(0, MAX_ATTEMPT_LOG)) {
    const v = item as Record<string, unknown> | null;
    if (typeof v !== 'object' || v === null || !isNum(v.at) || !isInterventionId(v.condition)) {
      continue;
    }
    out.push({
      ...(typeof v.site === 'string' && { site: v.site }),
      at: v.at,
      condition: v.condition,
      outcome: isAttemptOutcome(v.outcome) ? v.outcome : null,
      dwellSeconds: isNum(v.dwellSeconds) && v.dwellSeconds >= 0 ? v.dwellSeconds : null,
    });
  }
  return out;
}

/** The attempt fields of a stored session; missing (before v0.4.0) → count null, empty list. */
export function attemptFieldsOf(value: unknown): AttemptFields {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const count = v.distractionAttempts;
  return {
    distractionAttempts: isNum(count) && Number.isInteger(count) && count >= 0 ? count : null,
    attempts: asAttempts(v.attempts),
  };
}

/** Retention (P12): the attempts without site names. */
export function withoutSites(attempts: readonly DistractionAttempt[]): DistractionAttempt[] {
  return attempts.map((a) => {
    const rest = { ...a };
    delete rest.site;
    return rest;
  });
}

/** Mean dwell time (s) of the attempts that have one, to 0.1 s; null if none. */
export function meanDwellSeconds(attempts: readonly DistractionAttempt[]): number | null {
  const values = attempts.map((a) => a.dwellSeconds).filter(isNum);
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}
