/**
 * Passive study groups (P18): sends my focus minutes and "focusing now" to the server, and only
 * that. Plain functions over injected dependencies (store, API client), so they are unit-testable.
 *
 * When something is sent (never otherwise — no background traffic for solo users):
 * - only if this browser is registered for study groups AND at least one of my groups has the
 *   matching switch on (cached locally) AND the browser permissions allow it (the API client
 *   checks server access and, on Firefox, the data collection consent before every request);
 * - **presence**: `start` when a session starts, `heartbeat` on the session's 1-minute tick
 *   alarm (only exists while a session runs), `stop` when it ends;
 * - **totals**: today's (and yesterday's, if a session crossed midnight) focus minutes when a
 *   session starts or ends, and at most every 5 minutes during a session; only values that changed
 *   since the server last confirmed them.
 *
 * Offline: a failed totals request leaves the values "unsent"; they go out with the next send
 * (at most every 5 minutes, also from the background heartbeat while something is unsent). A
 * failed presence request is simply retried on the next tick; a lost `stop` expires on the server
 * within 3 minutes anyway. None of this ever blocks or delays solo features.
 */
import {
  MAX_DAILY_FOCUS_MINUTES,
  TOTALS_INTERVAL_MS,
  addDays,
  type DailyTotal,
} from '@studylens/shared';
import type { ActiveSession, FocusSession } from '../sessions/session';
import type { KeyValueStore } from '../storage/activity-store';
import { loadActiveSession, loadSessions } from '../storage/sessions-store';
import { localDayId, splitAtLocalMidnight } from '../tracker/local-day';
import type { ApiClient, ApiFailure } from './api-client';
import {
  loadGroupDevice,
  loadSharingCache,
  loadSyncState,
  saveSyncState,
  sharesAnywhere,
} from './group-store';

/**
 * Focus minutes per local date: time inside finished sessions plus the running one (up to `now`),
 * split at local midnight. Whole minutes, rounded down, at most 1440 per day.
 */
export function focusMinutesByDate(
  history: readonly FocusSession[],
  active: ActiveSession | null,
  now: number,
): Map<string, number> {
  const ms = new Map<string, number>();
  const add = (start: number, end: number) => {
    for (const part of splitAtLocalMidnight(start, end)) {
      ms.set(part.day, (ms.get(part.day) ?? 0) + part.end - part.start);
    }
  };
  for (const s of history) add(s.start, Math.min(s.actualEnd, now));
  if (active) add(active.start, Math.min(now, active.plannedEnd));
  const minutes = new Map<string, number>();
  for (const [day, total] of ms) {
    minutes.set(day, Math.min(MAX_DAILY_FOCUS_MINUTES, Math.floor(total / 60_000)));
  }
  return minutes;
}

/**
 * Why the sync runs:
 * - `session-start` / `session-end`: a focus session started or ended (always worth a send);
 * - `tick`: the running session's 1-minute alarm (presence heartbeat; totals every 5 minutes);
 * - `heartbeat`: the always-on background alarm — only retries unsent totals, never presence;
 * - `settings`: a sharing switch changed or a group was joined (send what is now shared).
 */
export type SyncReason = 'session-start' | 'session-end' | 'tick' | 'heartbeat' | 'settings';

export interface SyncDeps {
  store: KeyValueStore;
  client: ApiClient;
}

export type SyncOutcome = 'not-sent' | 'sent' | 'stored-nothing' | 'failed' | 'not-allowed';

export interface SyncResult {
  totals: SyncOutcome;
  presence: SyncOutcome;
}

const notAllowed = (f: ApiFailure) =>
  f.kind === 'no-permission' || f.kind === 'no-activity-consent' || f.kind === 'no-name-consent';

/**
 * Sends whatever is due (see the file comment). Never throws; returns what happened, for tests
 * and logs.
 */
export async function syncActivity(
  deps: SyncDeps,
  now: number,
  reason: SyncReason,
): Promise<SyncResult> {
  const result: SyncResult = { totals: 'not-sent', presence: 'not-sent' };
  try {
    const device = await loadGroupDevice(deps.store);
    if (!device) return result;
    const shares = sharesAnywhere(await loadSharingCache(deps.store));
    if (!shares.focusMinutes && !shares.focusingNow) return result;

    const [state, active, history] = await Promise.all([
      loadSyncState(deps.store),
      loadActiveSession(deps.store),
      shares.focusMinutes ? loadSessions(deps.store) : Promise.resolve([]),
    ]);
    const today = localDayId(now);

    // Presence: only around a running session (never from the always-on heartbeat).
    if (shares.focusingNow && reason !== 'heartbeat') {
      const running = active !== null && now < active.plannedEnd;
      const send = running
        ? reason === 'session-start' || !state.presenceOn
          ? 'start'
          : 'heartbeat'
        : state.presenceOn
          ? 'stop'
          : null;
      if (send) {
        const res = await deps.client.sendPresence(device.token, send);
        if (res.ok) {
          state.presenceOn = res.data.focusing;
          result.presence = res.data.focusing || send === 'stop' ? 'sent' : 'stored-nothing';
        } else {
          // A lost `stop` expires on the server within 3 minutes, so don't keep retrying it.
          if (send === 'stop') state.presenceOn = false;
          result.presence = notAllowed(res) ? 'not-allowed' : 'failed';
        }
      }
    }

    // Totals: today and yesterday (a session can cross midnight), only what changed.
    if (shares.focusMinutes) {
      const minutes = focusMinutesByDate(history, active, now);
      const days: DailyTotal[] = [addDays(today, -1), today]
        .map((localDate) => ({ localDate, focusMinutes: minutes.get(localDate) ?? 0 }))
        .filter((d) => d.focusMinutes !== (state.sent[d.localDate] ?? 0));
      const urgent =
        reason === 'session-start' || reason === 'session-end' || reason === 'settings';
      const waited =
        state.lastTotalsAttempt === null || now - state.lastTotalsAttempt >= TOTALS_INTERVAL_MS;
      if (days.length > 0 && (urgent || waited)) {
        const res = await deps.client.sendTotals(device.token, days);
        if (res.ok) {
          state.lastTotalsAttempt = now;
          // `stored: 0` = no group shares minutes any more (switch turned off elsewhere): don't
          // resend the same numbers again and again.
          for (const d of days) state.sent[d.localDate] = d.focusMinutes;
          result.totals = res.data.stored > 0 ? 'sent' : 'stored-nothing';
        } else if (notAllowed(res)) {
          result.totals = 'not-allowed';
        } else {
          state.lastTotalsAttempt = now;
          result.totals = 'failed';
        }
      }
    }

    await saveSyncState(deps.store, state, today);
  } catch (err) {
    console.error('[StudyLens] study group sync failed', err);
  }
  return result;
}
