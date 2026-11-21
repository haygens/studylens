/**
 * Runs focus sessions in the background script (P4). The background can be suspended or the
 * browser restarted at any time, so all state lives in storage and every function here is safe to
 * call again. Browser side effects (alarms, badge) are injected so this is unit-testable.
 */
import {
  getSegmentsForDays,
  loadTrackerState,
  type KeyValueStore,
} from '../storage/activity-store';
import { loadRules } from '../storage/categories-store';
import { assignCondition, type RandomInt } from '../interventions/randomize';
import {
  BLOCK_KEY,
  loadBlock,
  loadInterventionSettings,
  loadNoticeState,
  shouldShowNotice,
} from '../storage/interventions-store';
import {
  finishSession,
  loadActiveSession,
  loadSessions,
  ACTIVE_SESSION_KEY,
  saveSessions,
} from '../storage/sessions-store';
import {
  LABEL_LOCK_KEY,
  LABEL_VERSION_KEY,
  SESSION_COUNTER_KEY,
  asLabelLock,
  asLabelSetVersion,
  nextSessionNumber,
} from '../storage/research-store';
import type { Segment } from '../tracker/tracker';
import {
  badgeText,
  createSession,
  isDue,
  type ActiveSession,
  type FocusSession,
  type StartError,
} from './session';
import {
  applyAutoSkips,
  checkInBadge,
  recordCheckIn,
  type CheckInError,
  type CheckInInput,
} from './check-in';
import { computeSessionStats } from './session-stats';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionEffects {
  /** (Re)create the alarms that end the session and tick the badge. */
  scheduleAlarms(session: ActiveSession): Promise<void>;
  clearAlarms(): Promise<void>;
  /** Badge text on the toolbar icon; '' hides it. */
  setBadge(text: string): Promise<void>;
}

export interface SessionDeps {
  store: KeyValueStore;
  effects: SessionEffects;
  newId: () => string;
  /** Random source for condition assignment (P8): cryptoRandomInt in the extension. */
  random: RandomInt;
}

export type StartResult = { ok: true; session: ActiveSession } | { ok: false; error: StartError };

export async function startSession(
  deps: SessionDeps,
  goal: string,
  minutes: number,
  now: number,
  /** E2E test build only; null in normal builds. */
  testSeconds: number | null = null,
): Promise<StartResult> {
  if (await loadActiveSession(deps.store)) return { ok: false, error: 'already-running' };
  // The user must answer the research notice first, so nobody gets a condition unannounced.
  if (shouldShowNotice(await loadNoticeState(deps.store))) {
    return { ok: false, error: 'notice-unanswered' };
  }
  const created = createSession(goal, minutes, now, deps.newId(), testSeconds);
  if (typeof created === 'string') return { ok: false, error: created };
  // A check-in still waiting is skipped: only the latest session is ever asked about.
  const history = await loadSessions(deps.store);
  const skipped = applyAutoSkips(history, now, true);
  if (skipped) await saveSessions(deps.store, skipped);
  // Research condition (P8). The session and the shortened block are saved in one write, so a
  // condition is used up exactly when a session really starts.
  const [settings, block, research] = await Promise.all([
    loadInterventionSettings(deps.store),
    loadBlock(deps.store),
    deps.store.get([SESSION_COUNTER_KEY, LABEL_LOCK_KEY, LABEL_VERSION_KEY]),
  ]);
  const assignment = assignCondition(settings, block, deps.random);
  // Research instrumentation (P13c): session order, label-set version and study mode.
  const sessionNumber = nextSessionNumber(research[SESSION_COUNTER_KEY], history.length);
  const session: ActiveSession = {
    ...created,
    condition: assignment.condition,
    mode: 'solo',
    sessionNumber,
    labelSetVersion: asLabelSetVersion(research[LABEL_VERSION_KEY]),
    labelsLocked: asLabelLock(research[LABEL_LOCK_KEY]).locked,
  };
  await deps.store.set({
    [ACTIVE_SESSION_KEY]: session,
    [SESSION_COUNTER_KEY]: sessionNumber,
    ...(assignment.block && { [BLOCK_KEY]: assignment.block }),
  });
  await deps.effects.scheduleAlarms(session);
  await deps.effects.setBadge(badgeText(session, now));
  return { ok: true, session };
}

/** Finished segments that may overlap [start, end], plus the tracker's open segment so far. */
async function segmentsDuring(
  store: KeyValueStore,
  start: number,
  end: number,
): Promise<Segment[]> {
  // Day buckets are keyed by the day a segment *started*, so include the day before `start`.
  const times: number[] = [];
  for (let t = start - DAY_MS; t < end; t += DAY_MS) times.push(t);
  times.push(end);
  const segments = await getSegmentsForDays(store, times);
  const { open } = await loadTrackerState(store);
  if (open) segments.push({ hostname: open.hostname, start: open.start, end: open.lastSeen });
  return segments;
}

async function endAt(
  deps: SessionDeps,
  session: ActiveSession,
  end: number,
  endedEarly: boolean,
): Promise<FocusSession> {
  const segments = await segmentsDuring(deps.store, session.start, end);
  const rules = await loadRules(deps.store);
  const finished: FocusSession = {
    ...session,
    actualEnd: end,
    endedEarly,
    ...computeSessionStats(segments, session.start, end, rules),
    // `condition` comes from the session as it was started (kept when ended early).
    checkIn: null,
  };
  await finishSession(deps.store, finished);
  await deps.effects.clearAlarms();
  // "?" until the check-in is answered (no notifications permission needed).
  await deps.effects.setBadge('?');
  return finished;
}

/**
 * Ends the active session if its planned end has passed — at the planned end time, even if we
 * only notice later (alarm delayed, background suspended, browser closed). Otherwise makes sure
 * the alarms and badge are in place. Call on every wake-up and on every session alarm.
 */
export async function reconcileSession(
  deps: SessionDeps,
  now: number,
): Promise<FocusSession | null> {
  const session = await loadActiveSession(deps.store);
  if (!session) {
    await expireCheckIns(deps, now);
    return null;
  }
  if (isDue(session, now)) return endAt(deps, session, session.plannedEnd, false);
  await deps.effects.scheduleAlarms(session);
  await deps.effects.setBadge(badgeText(session, now));
  return null;
}

/** "End early" from the popup. If the planned end already passed, it ends normally instead. */
export async function endSessionEarly(
  deps: SessionDeps,
  now: number,
): Promise<FocusSession | null> {
  const session = await loadActiveSession(deps.store);
  if (!session) return null;
  if (isDue(session, now)) return endAt(deps, session, session.plannedEnd, false);
  return endAt(deps, session, now, true);
}

/**
 * Skips check-ins that waited too long, and shows "?" on the badge while one is waiting.
 * Does nothing while a session runs (its badge shows the minutes). Run on every heartbeat.
 */
export async function expireCheckIns(deps: SessionDeps, now: number): Promise<void> {
  const active = await loadActiveSession(deps.store);
  if (active) return;
  let history = await loadSessions(deps.store);
  const updated = applyAutoSkips(history, now, false);
  if (updated) {
    await saveSessions(deps.store, updated);
    history = updated;
  }
  await deps.effects.setBadge(checkInBadge(history, null, now));
}

export type CheckInResult = { ok: true } | { ok: false; error: CheckInError };

/** Saves the popup's answer (or Skip) on the pending session and clears the "?" badge. */
export async function submitCheckIn(
  deps: SessionDeps,
  sessionId: string,
  input: CheckInInput,
  now: number,
): Promise<CheckInResult> {
  if (await loadActiveSession(deps.store)) return { ok: false, error: 'not-pending' };
  const result = recordCheckIn(await loadSessions(deps.store), sessionId, input, now);
  if (typeof result === 'string') return { ok: false, error: result };
  await saveSessions(deps.store, result);
  await deps.effects.setBadge(checkInBadge(result, null, now));
  return { ok: true };
}

/** Updates the badge's minutes (on the per-minute tick alarm). */
export async function refreshBadge(deps: SessionDeps, now: number): Promise<void> {
  await deps.effects.setBadge(badgeText(await loadActiveSession(deps.store), now));
}
