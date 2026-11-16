/**
 * Data loading for the popup, kept out of the React components so it is unit-testable.
 *
 * Every loader returns a `LoadState` and never rejects or hangs: a storage read that fails or
 * never answers becomes a visible error in the popup instead of a silently empty section.
 */
import { categoryOf } from '../categories/rules';
import { totalsBySite, type SiteTotal } from '../categories/sites';
import type { ActiveSession, FocusSession } from '../sessions/session';
import {
  getSegmentsForDays,
  isTrackingPaused,
  loadTrackerState,
  type KeyValueStore,
} from '../storage/activity-store';
import { loadRules } from '../storage/categories-store';
import { loadActiveSession, loadSessions } from '../storage/sessions-store';
import { startOfLocalDay, totalsByHostname } from '../tracker/totals';
import { MAX_GAP_MS, type Segment } from '../tracker/tracker';

/** How long the popup waits for storage before showing an error. */
export const LOAD_TIMEOUT_MS = 5_000;

export type LoadState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Waits for `promise`, but resolves to an error state if it rejects or takes too long. */
export function settle<T>(promise: Promise<T>, timeoutMs: number): Promise<LoadState<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () =>
        resolve({
          status: 'error',
          message: `Timed out after ${timeoutMs} ms reading extension storage.`,
        }),
      timeoutMs,
    );
    promise.then(
      (data) => {
        clearTimeout(timer);
        resolve({ status: 'ready', data });
      },
      (err: unknown) => {
        clearTimeout(timer);
        console.error('[StudyLens] popup load failed', err);
        resolve({ status: 'error', message: errorMessage(err) });
      },
    );
  });
}

export interface SessionView {
  active: ActiveSession | null;
  last: FocusSession | null;
}

export function loadSessionView(
  store: KeyValueStore,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<LoadState<SessionView>> {
  const load = async (): Promise<SessionView> => {
    const [active, history] = await Promise.all([loadActiveSession(store), loadSessions(store)]);
    return { active, last: history.at(-1) ?? null };
  };
  return settle(load(), timeoutMs);
}

export interface DebugSnapshot {
  sites: SiteTotal[];
  current: string | null;
  currentCategory: ReturnType<typeof categoryOf> | null;
  paused: boolean;
}

/** Today's (local day) minutes per site, for the temporary debug view. */
export function loadDebugSnapshot(
  store: KeyValueStore,
  now: number,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<LoadState<DebugSnapshot>> {
  const load = async (): Promise<DebugSnapshot> => {
    const dayStart = startOfLocalDay(now);
    // Include yesterday's bucket so a segment that started before midnight is clipped into today.
    const [stored, state, rules, paused] = await Promise.all([
      getSegmentsForDays(store, [dayStart - 1, now]),
      loadTrackerState(store),
      loadRules(store),
      isTrackingPaused(store),
    ]);
    const segments: Segment[] = [...stored];
    const { open } = state;
    // Count the open segment up to now, but never past what the tracker itself would trust.
    if (open) {
      segments.push({
        hostname: open.hostname,
        start: open.start,
        end: Math.min(now, open.lastSeen + MAX_GAP_MS),
      });
    }
    const current = open?.hostname ?? null;
    return {
      sites: totalsBySite(totalsByHostname(segments, dayStart, now + 1), rules),
      current,
      currentCategory: current ? categoryOf(current, rules) : null,
      paused,
    };
  };
  return settle(load(), timeoutMs);
}
