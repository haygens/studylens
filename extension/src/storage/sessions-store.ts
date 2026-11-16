/**
 * Local storage for focus sessions (P4). Stays on the device (privacy rule 1) — the goal text is
 * never sent anywhere.
 *
 * Keys:
 * - `sessions:active`  — the running session, or null. Only one session at a time.
 * - `sessions:history` — finished sessions, oldest first.
 */
import { isCheckIn } from '@studylens/shared';
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

/** Valid sessions only. A missing or malformed check-in counts as not answered yet. */
export function asHistory(value: unknown): FocusSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isFocusSession)
    .map((s) => ({ ...s, checkIn: isCheckIn(s.checkIn) ? s.checkIn : null }));
}

export async function loadActiveSession(store: KeyValueStore): Promise<ActiveSession | null> {
  const { [ACTIVE_SESSION_KEY]: saved } = await store.get([ACTIVE_SESSION_KEY]);
  return isActiveSession(saved) ? saved : null;
}

export async function saveActiveSession(
  store: KeyValueStore,
  session: ActiveSession,
): Promise<void> {
  await store.set({ [ACTIVE_SESSION_KEY]: session });
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
