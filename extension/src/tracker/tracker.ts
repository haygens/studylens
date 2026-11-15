/**
 * Pure time-accounting logic for activity tracking. No browser APIs here — the background script
 * turns browser events into TrackerEvents, calls `step`, and persists the returned state.
 *
 * Because the background script can be suspended at any moment, the whole state is plain JSON and
 * is saved after every step. The open segment remembers `lastSeen`, the last time we confirmed the
 * user was still on that site (any event or the ~1 minute heartbeat alarm).
 */

/** Idle threshold passed to `browser.idle.setDetectionInterval`. */
export const IDLE_THRESHOLD_SECONDS = 60;
/** Period of the heartbeat alarm. */
export const HEARTBEAT_MINUTES = 1;
/**
 * Longest gap between two observations that we still trust. Heartbeats normally arrive every
 * ~60s, so a bigger gap means the computer slept, the browser was closed, or it crashed. In that
 * case the open segment is closed at `lastSeen` and the unverified gap is not counted at all.
 */
export const MAX_GAP_MS = 2 * 60_000;
/** Segments shorter than this are dropped (tab flicking, redirects). */
export const MIN_SEGMENT_MS = 1_000;

export type IdleState = 'active' | 'idle' | 'locked';

/** Everything we know about the browser right now. */
export interface TrackerContext {
  /** Hostname of the active tab in the focused window, or null if it isn't trackable. */
  hostname: string | null;
  windowFocused: boolean;
  idle: IdleState;
  paused: boolean;
}

/** A finished, stored activity segment. Times are epoch milliseconds. */
export interface Segment {
  hostname: string;
  start: number;
  end: number;
}

export interface OpenSegment {
  hostname: string;
  start: number;
  /** Last time we confirmed the user was still here. */
  lastSeen: number;
}

export interface TrackerState {
  context: TrackerContext;
  open: OpenSegment | null;
}

export type TrackerEvent =
  /** The active tab changed, or the active tab navigated to a new URL. */
  | { type: 'tab'; hostname: string | null }
  /** The browser gained or lost focus. */
  | { type: 'focus'; focused: boolean }
  | { type: 'idle'; state: IdleState }
  | { type: 'paused'; paused: boolean }
  /** Periodic alarm: proves the open segment is still alive. */
  | { type: 'heartbeat' }
  /** Full re-read of the browser state (on wake-up / browser start). */
  | { type: 'sync'; context: TrackerContext };

export interface StepResult {
  state: TrackerState;
  /** Segments that were closed by this step (already filtered by MIN_SEGMENT_MS). */
  segments: Segment[];
}

export function initialState(): TrackerState {
  return {
    context: { hostname: null, windowFocused: false, idle: 'active', paused: false },
    open: null,
  };
}

/** The hostname that should be accumulating time in this context, or null. */
export function activeHostname(context: TrackerContext): string | null {
  if (context.paused || !context.windowFocused || context.idle !== 'active') return null;
  return context.hostname;
}

function applyEvent(context: TrackerContext, event: TrackerEvent): TrackerContext {
  switch (event.type) {
    case 'tab':
      return { ...context, hostname: event.hostname };
    case 'focus':
      return { ...context, windowFocused: event.focused };
    case 'idle':
      return { ...context, idle: event.state };
    case 'paused':
      return { ...context, paused: event.paused };
    case 'sync':
      return { ...event.context };
    case 'heartbeat':
      return context;
  }
}

function finish(open: OpenSegment, end: number, out: Segment[]): void {
  if (end - open.start >= MIN_SEGMENT_MS) {
    out.push({ hostname: open.hostname, start: open.start, end });
  }
}

/**
 * Advance the tracker by one event at time `now`.
 *
 * 1. Bring the open segment up to `now` — unless the gap since `lastSeen` is too big to trust,
 *    in which case it is closed at `lastSeen`.
 * 2. Apply the event to the context.
 * 3. If the site that should be tracked changed, close the open segment and start a new one.
 */
export function step(state: TrackerState, event: TrackerEvent, now: number): StepResult {
  const segments: Segment[] = [];
  let open = state.open;

  if (open) {
    const gap = now - open.lastSeen;
    if (gap > MAX_GAP_MS || gap < 0) {
      // Suspended/asleep/crashed (or the clock jumped backwards): keep only verified time.
      finish(open, open.lastSeen, segments);
      open = null;
    } else {
      open = { ...open, lastSeen: now };
    }
  }

  const context = applyEvent(state.context, event);
  const wanted = activeHostname(context);

  if (open && open.hostname !== wanted) {
    finish(open, open.lastSeen, segments);
    open = null;
  }
  if (!open && wanted) {
    open = { hostname: wanted, start: now, lastSeen: now };
  }

  return { state: { context, open }, segments };
}
