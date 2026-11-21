/**
 * Small pure helpers for what the popup shows (P13b): why a button is disabled, minutes in
 * plain words, today's totals per category, and the one-line "Last session" summary.
 */
import type { SiteCategory } from '@studylens/shared';
import { formatCheckIn } from '../sessions/check-in';
import {
  MAX_CUSTOM_MINUTES,
  MIN_CUSTOM_MINUTES,
  normalizeGoal,
  type FocusSession,
} from '../sessions/session';

export interface StartFormState {
  /** The research notice is unanswered ('blocked') or still loading. */
  gate: 'loading' | 'blocked' | 'open';
  goal: string;
  /** Whether the chosen length is allowed (whole minutes in range). */
  lengthOk: boolean;
  busy: boolean;
}

/**
 * Why "Start focus session" can't be pressed right now, or null if it can. Shown right next to
 * the button, so a disabled button is never a mystery.
 */
export function startBlockReason(s: StartFormState): string | null {
  if (s.gate === 'loading') return 'Loading…';
  if (s.gate === 'blocked')
    return 'First choose “Keep on” or “Turn off” in the research notice above.';
  if (normalizeGoal(s.goal) === null) return 'Write what you’ll work on to start.';
  if (!s.lengthOk) {
    return `Pick a length from ${MIN_CUSTOM_MINUTES} to ${MAX_CUSTOM_MINUTES} minutes.`;
  }
  if (s.busy) return 'Starting…';
  return null;
}

/** Why "Save check-in" can't be pressed yet, or null. */
export function checkInBlockReason(goalAnswered: boolean, ratingAnswered: boolean): string | null {
  if (goalAnswered && ratingAnswered) return null;
  if (!goalAnswered && !ratingAnswered) return 'Answer both questions to save, or press Skip.';
  return goalAnswered
    ? 'Pick how focused you were (1–5) to save.'
    : 'Pick Yes, Partly or No to save.';
}

/** "<1 min", "12 min", "1 h 5 min". Rounded to whole minutes. */
export function formatWholeMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export type CategoryTotals = Record<SiteCategory, number>;

/** Milliseconds per category, summed over today's sites. */
export function categoryTotals(
  sites: readonly { category: SiteCategory; ms: number }[],
): CategoryTotals {
  const totals: CategoryTotals = { study: 0, neutral: 0, distraction: 0 };
  for (const s of sites) totals[s.category] += s.ms;
  return totals;
}

/**
 * "Last session: 25 of 25 min · Finished: yes · Focus 4/5". Details (minutes per category,
 * distraction visits) are on the My Data page.
 */
export function lastSessionSummary(session: FocusSession): string {
  const actualMs = session.actualEnd - session.start;
  const actual = actualMs < 60_000 ? '<1' : String(Math.round(actualMs / 60_000));
  const planned = session.plannedMinutes < 1 ? '<1' : String(Math.round(session.plannedMinutes));
  const parts = [
    `Last session: ${actual} of ${planned} min${session.endedEarly ? ' (ended early)' : ''}`,
  ];
  const checkIn = formatCheckIn(session.checkIn);
  if (checkIn) parts.push(checkIn);
  return parts.join(' · ');
}

/** Fraction of the session already done, 0–1, for the progress ring. */
export function sessionProgress(plannedMs: number, remainingMs: number): number {
  if (plannedMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs / plannedMs));
}
