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
import { GROUP_CONDITION } from '@studylens/shared';
import type { Segment } from '../tracker/tracker';
import { NO_ATTEMPTS } from '../interventions/attempts';
import { NO_COUNTS } from '../interventions/interstitial';
import {
  MAX_CUSTOM_MINUTES,
  badgeText,
  createSession,
  isDue,
  normalizeGoal,
  type ActiveSession,
  type FocusSession,
  type GroupLink,
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
import { isInGroup } from '../groups/group-store';

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
  const [settings, block, research, inGroup] = await Promise.all([
    loadInterventionSettings(deps.store),
    loadBlock(deps.store),
    deps.store.get([SESSION_COUNTER_KEY, LABEL_LOCK_KEY, LABEL_VERSION_KEY]),
    isInGroup(deps.store),
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
    // P18: passive group membership is only a local covariate; the session stays `solo`.
    inGroup,
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

/** P18b: what the popup / Study groups tab tells the background after the server said yes. */
export interface GroupSessionInput {
  link: GroupLink;
  /** The group's goal (visible to the group), or null. */
  goal: string | null;
  /** The shared end time in this browser's clock (server end − clock offset). */
  plannedEnd: number;
}

export type GroupStartError = 'already-running' | 'session-over' | 'invalid-group-session';

export type GroupStartResult =
  { ok: true; session: ActiveSession } | { ok: false; error: GroupStartError };

const SECOND_MS = 1000;
/** A shared end closer than this is not worth starting a session for. */
const MIN_GROUP_REMAINING_MS = 5 * SECOND_MS;

/**
 * P18b: starts the local focus session for a live group session I just started or joined (or
 * rejoin after a restart). It ends at the SHARED end time. Research: `mode: "group"`, condition
 * `group`, and the block randomization is NOT touched, so the solo conditions stay balanced. It
 * still gets the next session number (session order on this device). No helper pages appear.
 * The research notice doesn't have to be answered first: no condition is assigned.
 */
export async function startGroupSession(
  deps: SessionDeps,
  input: GroupSessionInput,
  now: number,
): Promise<GroupStartResult> {
  if (await loadActiveSession(deps.store)) return { ok: false, error: 'already-running' };
  const remaining = input.plannedEnd - now;
  if (remaining < MIN_GROUP_REMAINING_MS) return { ok: false, error: 'session-over' };
  // The server never allows more than 180 minutes; anything longer is a broken message.
  if (remaining > (MAX_CUSTOM_MINUTES + 1) * 60_000) {
    return { ok: false, error: 'invalid-group-session' };
  }
  const history = await loadSessions(deps.store);
  const skipped = applyAutoSkips(history, now, true);
  if (skipped) await saveSessions(deps.store, skipped);
  const [research, inGroup] = await Promise.all([
    deps.store.get([SESSION_COUNTER_KEY, LABEL_LOCK_KEY, LABEL_VERSION_KEY]),
    isInGroup(deps.store),
  ]);
  const sessionNumber = nextSessionNumber(research[SESSION_COUNTER_KEY], history.length);
  const session: ActiveSession = {
    id: deps.newId(),
    goal: normalizeGoal(input.goal ?? '') ?? `Group session: ${input.link.groupName}`,
    // From when I joined: a late joiner's planned length is the time left.
    plannedMinutes: Math.round(remaining / 6_000) / 10,
    start: now,
    plannedEnd: input.plannedEnd,
    condition: GROUP_CONDITION,
    ...NO_COUNTS,
    ...NO_ATTEMPTS,
    mode: 'group',
    sessionNumber,
    labelSetVersion: asLabelSetVersion(research[LABEL_VERSION_KEY]),
    labelsLocked: asLabelLock(research[LABEL_LOCK_KEY]).locked,
    inGroup,
    group: input.link,
  };
  // No BLOCK_KEY here: group sessions never use up a randomization slot.
  await deps.store.set({ [ACTIVE_SESSION_KEY]: session, [SESSION_COUNTER_KEY]: sessionNumber });
  await deps.effects.scheduleAlarms(session);
  await deps.effects.setBadge(badgeText(session, now));
  return { ok: true, session };
}

/** End times closer than this to the current one are left alone (no alarm churn). */
export const END_CORRECTION_THRESHOLD_MS = 2 * SECOND_MS;

/**
 * P18b: the server's shared end time, measured again (heartbeat / poll), in this browser's clock.
 * Moves the running group session's end if it differs by more than 2 s (clock drift or a
 * corrected offset), and ends it at once if that end has already passed.
 * @returns the finished session if it ended now.
 */
export async function correctGroupSessionEnd(
  deps: SessionDeps,
  serverSessionId: string,
  plannedEnd: number,
  clockOffsetMs: number,
  now: number,
): Promise<FocusSession | null> {
  const session = await loadActiveSession(deps.store);
  if (!session?.group || session.group.sessionId !== serverSessionId) return null;
  if (Math.abs(plannedEnd - session.plannedEnd) <= END_CORRECTION_THRESHOLD_MS) return null;
  const updated: ActiveSession = {
    ...session,
    plannedEnd: Math.max(session.start, plannedEnd),
    group: { ...session.group, clockOffsetMs },
  };
  if (isDue(updated, now)) return endAt(deps, updated, updated.plannedEnd, false);
  await deps.store.set({ [ACTIVE_SESSION_KEY]: updated });
  await deps.effects.scheduleAlarms(updated);
  await deps.effects.setBadge(badgeText(updated, now));
  return null;
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
