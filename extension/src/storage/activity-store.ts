/**
 * Local storage for activity tracking. Everything stays on the device (privacy rule 1).
 *
 * Keys:
 * - `tracker:state`      — the pure tracker's state, including the open segment
 * - `tracking:paused`    — boolean "tracking paused" flag (UI arrives in P6)
 * - `activity:YYYY-MM-DD` — finished segments, bucketed by the local day the segment started.
 *                           Day buckets keep writes small and make retention (P12) easy.
 */
import { initialState, type Segment, type TrackerState } from '../tracker/tracker';

/** The tiny slice of `browser.storage.local` we use, so this module is testable without a browser. */
export interface KeyValueStore {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const STATE_KEY = 'tracker:state';
export const PAUSED_KEY = 'tracking:paused';
const DAY_PREFIX = 'activity:';

/** `activity:2026-11-14` for the local day containing `time`. */
export function dayKey(time: number): string {
  const d = new Date(time);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${DAY_PREFIX}${d.getFullYear()}-${mm}-${dd}`;
}

function isSegment(value: unknown): value is Segment {
  const v = value as Segment | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.hostname === 'string' &&
    typeof v.start === 'number' &&
    typeof v.end === 'number'
  );
}

function asSegments(value: unknown): Segment[] {
  return Array.isArray(value) ? value.filter(isSegment) : [];
}

export async function loadTrackerState(store: KeyValueStore): Promise<TrackerState> {
  const { [STATE_KEY]: saved } = await store.get([STATE_KEY]);
  const s = saved as TrackerState | undefined;
  if (s && typeof s === 'object' && s.context && 'open' in s) return s;
  return initialState();
}

export async function saveTrackerState(store: KeyValueStore, state: TrackerState): Promise<void> {
  await store.set({ [STATE_KEY]: state });
}

export async function isTrackingPaused(store: KeyValueStore): Promise<boolean> {
  const { [PAUSED_KEY]: paused } = await store.get([PAUSED_KEY]);
  return paused === true;
}

export async function setTrackingPaused(store: KeyValueStore, paused: boolean): Promise<void> {
  await store.set({ [PAUSED_KEY]: paused });
}

/** Appends finished segments to their day buckets. */
export async function appendSegments(store: KeyValueStore, segments: Segment[]): Promise<void> {
  if (segments.length === 0) return;
  const byDay = new Map<string, Segment[]>();
  for (const seg of segments) {
    const key = dayKey(seg.start);
    byDay.set(key, [...(byDay.get(key) ?? []), seg]);
  }
  const existing = await store.get([...byDay.keys()]);
  const updates: Record<string, Segment[]> = {};
  for (const [key, added] of byDay) {
    updates[key] = [...asSegments(existing[key]), ...added];
  }
  await store.set(updates);
}

/** Segments that started on the local days containing each of `times`. */
export async function getSegmentsForDays(
  store: KeyValueStore,
  times: number[],
): Promise<Segment[]> {
  const keys = [...new Set(times.map(dayKey))];
  const stored = await store.get(keys);
  return keys.flatMap((key) => asSegments(stored[key]));
}

/** In-memory KeyValueStore for tests. */
export function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore & {
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = structuredClone(initial);
  return {
    data,
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
  };
}
