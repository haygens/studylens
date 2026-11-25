/**
 * Live group focus sessions (P18b): what the popup, the Study groups tab and the background do
 * with the server, as plain functions over injected dependencies, so they are unit-testable.
 *
 * - **Clock:** every answer carries the server's time. The offset (server − this browser) is
 *   measured on each request (the middle of the request is taken as "now"), and the shared end
 *   time is turned into this browser's clock with it. The heartbeat re-measures it every minute
 *   and moves the local end if it is more than 2 s off.
 * - **Polling, not WebSockets:** the popup and the Study groups tab ask every 15 s, only while
 *   they are open and visible. Vercel Hobby functions can't hold connections open, and plain
 *   requests keep working through sleep, flaky Wi-Fi and serverless restarts; a 15 s delay is fine
 *   for "who is focusing".
 * - **Background traffic:** only while a group session runs here — a heartbeat on the session's
 *   1-minute tick — and a retry of a "leave" that couldn't be sent (offline).
 * - **Privacy:** start/join send the goal (optional, visible to the group) and the length; the
 *   heartbeat sends nothing but the token. Never URLs, sites, labels, conditions or check-ins.
 */
import {
  clockOffset,
  toLocalTime,
  type LiveSession,
  type LiveSessionResponse,
} from '@studylens/shared';
import type { FocusSession } from '../sessions/session';
import type { GroupSessionInput } from '../sessions/session-controller';
import type { FullStore } from '../storage/activity-store';
import { STORAGE_KEYS } from '../storage/keys';
import { loadActiveSession, loadSessions } from '../storage/sessions-store';
import type { ApiClient, ApiFailure, ApiResult } from './api-client';
import { loadGroupDevice, loadSharingCache, type GroupDevice } from './group-store';

export interface LiveDeps {
  store: FullStore;
  client: ApiClient;
  now?: () => number;
}

/** A live-session answer with the measured clock offset (server − this browser, ms). */
export interface Timed<T> {
  data: T;
  offsetMs: number;
}

const clock = (deps: LiveDeps) => deps.now ?? Date.now;

async function timed<T extends { serverNow: number }>(
  deps: LiveDeps,
  request: () => Promise<ApiResult<T>>,
): Promise<ApiResult<Timed<T>>> {
  const sentAt = clock(deps)();
  const res = await request();
  if (!res.ok) return res;
  const offsetMs = clockOffset(sentAt, clock(deps)(), res.data.serverNow);
  return { ok: true, data: { data: res.data, offsetMs } };
}

/** This browser's registration, but only while it is in at least one group (else: send nothing). */
async function deviceInGroups(store: FullStore): Promise<GroupDevice | null> {
  const device = await loadGroupDevice(store);
  if (!device) return null;
  return Object.keys(await loadSharingCache(store)).length > 0 ? device : null;
}

/**
 * The running live sessions in my groups, or null when this browser isn't in any group (then
 * nothing is sent at all).
 */
export async function activeLiveSessions(
  deps: LiveDeps,
): Promise<ApiResult<Timed<LiveSession[]>> | null> {
  const device = await deviceInGroups(deps.store);
  if (!device) return null;
  const res = await timed(deps, () => deps.client.listLive(device.token));
  return res.ok
    ? { ok: true, data: { data: res.data.data.sessions, offsetMs: res.data.offsetMs } }
    : res;
}

/** One live session (running, or ended for its summary), or null when not registered. */
export async function liveSessionState(
  deps: LiveDeps,
  sessionId: string,
): Promise<ApiResult<Timed<LiveSession>> | null> {
  const device = await loadGroupDevice(deps.store);
  if (!device) return null;
  const res = await timed(deps, () => deps.client.getLive(device.token, sessionId));
  return res.ok
    ? { ok: true, data: { data: res.data.data.session, offsetMs: res.data.offsetMs } }
    : res;
}

/** What the background needs to run the local session for a live session. */
export function groupSessionInput(
  session: LiveSession,
  offsetMs: number,
  isHost: boolean,
): GroupSessionInput {
  return {
    link: {
      sessionId: session.id,
      groupId: session.groupId,
      groupName: session.groupName,
      isHost,
      clockOffsetMs: offsetMs,
    },
    goal: session.goal,
    plannedEnd: toLocalTime(session.endsAt, offsetMs),
  };
}

/** Why the local session couldn't start (after the server said yes), in the background's words. */
export type LocalStartError =
  'already-running' | 'session-over' | 'invalid-group-session' | 'unknown';

export type BeginResult =
  | { ok: true; session: LiveSession }
  | { ok: false; failure: ApiFailure }
  | { ok: false; local: LocalStartError };

export interface BeginDeps extends LiveDeps {
  /** Asks the background to start the local focus session (a runtime message in the extension). */
  startLocal: (input: GroupSessionInput) => Promise<{ ok: true } | { ok: false; error: string }>;
}

async function begin(
  deps: BeginDeps,
  request: (device: GroupDevice) => Promise<ApiResult<LiveSessionResponse>>,
  isHost: boolean,
): Promise<BeginResult> {
  const device = await loadGroupDevice(deps.store);
  if (!device) return { ok: false, failure: { ok: false, kind: 'no-permission' } };
  const res = await timed(deps, () => request(device));
  if (!res.ok) return { ok: false, failure: res };
  const { session } = res.data.data;
  const local = await deps
    .startLocal(groupSessionInput(session, res.data.offsetMs, isHost))
    .catch(() => ({ ok: false as const, error: 'unknown' }));
  if (!local.ok) {
    // The server has me in it, but no local session runs: take it back, so the others don't see
    // me "focusing" when I'm not.
    await deps.client.leaveLive(device.token, session.id).catch(() => undefined);
    const known = ['already-running', 'session-over', 'invalid-group-session'];
    return {
      ok: false,
      local: (known.includes(local.error) ? local.error : 'unknown') as LocalStartError,
    };
  }
  return { ok: true, session };
}

/**
 * Starts a live session in one of my groups (goal optional, visible to the group) and the local
 * focus session ending at the shared end. `testSeconds`: E2E build only (null otherwise).
 */
export function startLiveSession(
  deps: BeginDeps,
  groupId: string,
  goal: string,
  minutes: number,
  testSeconds: number | null = null,
): Promise<BeginResult> {
  const trimmed = goal.trim();
  return begin(
    deps,
    (device) =>
      deps.client.startLive(device.token, groupId, {
        minutes,
        ...(trimmed && { goal: trimmed }),
        // A build-time literal: normal builds compile this away (scripts/check-builds.mjs).
        ...(__STUDYLENS_E2E__ && testSeconds !== null && { testSeconds }),
      }),
    true,
  );
}

/** Joins a running live session (late is fine) and starts the local session to the shared end. */
export function joinLiveSession(deps: BeginDeps, sessionId: string): Promise<BeginResult> {
  return begin(deps, (device) => deps.client.joinLive(device.token, sessionId), false);
}

// ---------------------------------------------------------------------------------------------
// Background

/** A "leave" the server hasn't confirmed yet (offline when the user left early). */
export interface PendingLeave {
  sessionId: string;
  /** Epoch ms. */
  since: number;
}

const PENDING_LEAVE = STORAGE_KEYS.groupLivePendingLeave;
/** After this long the session is long over; stop trying. */
export const PENDING_LEAVE_MAX_AGE_MS = 24 * 60 * 60_000;

export function asPendingLeave(value: unknown): PendingLeave | null {
  const v = value as Partial<PendingLeave> | null;
  if (typeof v !== 'object' || v === null || typeof v.sessionId !== 'string' || !v.sessionId) {
    return null;
  }
  return { sessionId: v.sessionId, since: typeof v.since === 'number' ? v.since : 0 };
}

/** Remembers a "leave" to send (now, and again later if offline). */
export async function savePendingLeave(store: FullStore, sessionId: string, now: number) {
  await store.set({ [PENDING_LEAVE]: { sessionId, since: now } satisfies PendingLeave });
}

export interface LiveSyncDeps extends LiveDeps {
  /** Moves the running group session's end (queued with the other session work). */
  correctEnd: (sessionId: string, plannedEnd: number, offsetMs: number) => Promise<void>;
  /** Ends the running session early (the server says I already left). */
  endEarly: () => Promise<void>;
}

export type LiveSyncReason = 'tick' | 'session-end' | 'heartbeat';

export type LiveSyncOutcome =
  | 'nothing'
  | 'heartbeat-sent'
  | 'heartbeat-failed'
  | 'left-elsewhere'
  | 'leave-sent'
  | 'leave-waiting'
  | 'leave-dropped';

/** Sends the pending "leave", if any. Gives up on a 4xx answer or after 24 h. */
async function sendPendingLeave(
  deps: LiveDeps,
  device: GroupDevice,
  now: number,
): Promise<LiveSyncOutcome | null> {
  const pending = asPendingLeave((await deps.store.get([PENDING_LEAVE]))[PENDING_LEAVE]);
  if (!pending) return null;
  if (now - pending.since > PENDING_LEAVE_MAX_AGE_MS) {
    await deps.store.remove([PENDING_LEAVE]);
    return 'leave-dropped';
  }
  const res = await deps.client.leaveLive(device.token, pending.sessionId);
  if (
    res.ok ||
    (res.kind === 'http' && res.status >= 400 && res.status < 500 && res.status !== 429)
  ) {
    await deps.store.remove([PENDING_LEAVE]);
    return res.ok ? 'leave-sent' : 'leave-dropped';
  }
  return 'leave-waiting';
}

/**
 * Background work for live sessions (never throws):
 * - `session-end`: if the session that just ended was a group session ended EARLY, tell the
 *   server I left (kept and retried if offline). One that reached the shared end needs nothing.
 * - `tick` (the running session's 1-minute alarm): heartbeat; correct the end time with the
 *   server's clock; end locally if the server says I already left.
 * - `heartbeat` (the always-on alarm): only retries a pending "leave".
 */
export async function syncLiveSession(
  deps: LiveSyncDeps,
  now: number,
  reason: LiveSyncReason,
): Promise<LiveSyncOutcome> {
  try {
    const device = await loadGroupDevice(deps.store);
    if (!device) return 'nothing';

    if (reason === 'session-end') {
      const last: FocusSession | undefined = (await loadSessions(deps.store)).at(-1);
      if (!last?.group || !last.endedEarly || now - last.actualEnd > 60_000) return 'nothing';
      await savePendingLeave(deps.store, last.group.sessionId, now);
      return (await sendPendingLeave(deps, device, now)) ?? 'nothing';
    }

    const retried = await sendPendingLeave(deps, device, now);
    if (reason === 'heartbeat') return retried ?? 'nothing';

    const active = await loadActiveSession(deps.store);
    if (!active?.group || now >= active.plannedEnd) return retried ?? 'nothing';
    const res = await timed(deps, () =>
      deps.client.heartbeatLive(device.token, active.group!.sessionId),
    );
    if (!res.ok) return 'heartbeat-failed';
    const { session } = res.data.data;
    if (session.me === 'left') {
      await deps.endEarly();
      return 'left-elsewhere';
    }
    await deps.correctEnd(
      session.id,
      toLocalTime(session.endsAt, res.data.offsetMs),
      res.data.offsetMs,
    );
    return 'heartbeat-sent';
  } catch (err) {
    console.error('[StudyLens] live session sync failed', err);
    return 'nothing';
  }
}
