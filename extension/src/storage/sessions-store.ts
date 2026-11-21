/**
 * Local storage for focus sessions (P4). Stays on the device (privacy rule 1) — the goal text is
 * never sent anywhere.
 *
 * Keys:
 * - `sessions:active`  — the running session, or null. Only one session at a time.
 * - `sessions:history` — finished sessions, oldest first.
 */
import { isCheckIn, isSessionCondition, isSessionMode } from '@studylens/shared';
import { countsOf } from '../interventions/interstitial';
import { attemptFieldsOf } from '../interventions/attempts';
import type { ActiveSession, FocusSession } from '../sessions/session';
import type { KeyValueStore } from './activity-store';
import { STORAGE_KEYS } from './keys';

export const ACTIVE_SESSION_KEY = STORAGE_KEYS.activeSession;
export const SESSION_HISTORY_KEY = STORAGE_KEYS.sessionHistory;

export function isActiveSession(value: unknown): value is ActiveSession {
  const v = value as ActiveSession | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.id === 'string' &&
    typeof v.goal === 'string' &&
    typeof v.plannedMinutes === 'number' &&
    typeof v.start === 'number' &&
    typeof v.plannedEnd === 'number'
  );
}

function isFocusSession(value: unknown): value is FocusSession {
  const v = value as FocusSession | null;
  return (
    isActiveSession(v) &&
    typeof v.actualEnd === 'number' &&
    typeof v.endedEarly === 'boolean' &&
    typeof v.distractionVisits === 'number' &&
    typeof v.minutesByCategory === 'object' &&
    v.minutesByCategory !== null
  );
}

/** A missing (v0.1) or unknown condition counts as not assigned. */
function conditionOf(value: unknown) {
  return isSessionCondition(value) ? value : null;
}

const positiveInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null;

/** P13c fields; sessions from before v0.4.0 get `solo`, no attempts count, no numbers. */
function researchFieldsOf(v: Record<string, unknown>) {
  return {
    ...attemptFieldsOf(v),
    mode: isSessionMode(v.mode) ? v.mode : ('solo' as const),
    sessionNumber: positiveInt(v.sessionNumber),
    labelSetVersion: positiveInt(v.labelSetVersion),
    labelsLocked: v.labelsLocked === true,
  };
}

/**
 * Valid sessions only. A missing or malformed check-in counts as not answered yet; missing
 * intervention counts (sessions before P9/P10) count as 0.
 */
export function asHistory(value: unknown): FocusSession[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFocusSession).map(({ compacted, ...s }) => ({
    ...s,
    ...countsOf(s),
    ...researchFieldsOf(s as unknown as Record<string, unknown>),
    condition: conditionOf(s.condition),
    checkIn: isCheckIn(s.checkIn) ? s.checkIn : null,
    // Retention (P12): compacted sessions have no goal text; everything else is kept.
    ...(compacted === true && { compacted }),
  }));
}

/** The stored active session, or null. Accepts sessions saved by v0.1 (no condition field). */
export function asActiveSession(value: unknown): ActiveSession | null {
  return isActiveSession(value)
    ? {
        ...value,
        ...countsOf(value),
        ...researchFieldsOf(value as unknown as Record<string, unknown>),
        condition: conditionOf(value.condition),
      }
    : null;
}

export async function loadActiveSession(store: KeyValueStore): Promise<ActiveSession | null> {
  const { [ACTIVE_SESSION_KEY]: saved } = await store.get([ACTIVE_SESSION_KEY]);
  return asActiveSession(saved);
}

export async function loadSessions(store: KeyValueStore): Promise<FocusSession[]> {
  const { [SESSION_HISTORY_KEY]: saved } = await store.get([SESSION_HISTORY_KEY]);
  return asHistory(saved);
}

/** Replaces the whole history (used to save check-in answers and auto-skips). */
export async function saveSessions(store: KeyValueStore, history: FocusSession[]): Promise<void> {
  await store.set({ [SESSION_HISTORY_KEY]: history });
}

/** Saves a finished session and clears the active one in a single write. */
export async function finishSession(store: KeyValueStore, session: FocusSession): Promise<void> {
  const history = (await loadSessions(store)).filter((s) => s.id !== session.id);
  await store.set({
    [SESSION_HISTORY_KEY]: [...history, session],
    [ACTIVE_SESSION_KEY]: null,
  });
}
