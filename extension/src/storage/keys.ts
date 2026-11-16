/**
 * Every key StudyLens stores in `browser.storage.local`, in one place (P6).
 *
 * The store modules take their key names from here, and "My Data" uses this list to label,
 * export and delete data. Tests check that every key the app writes is listed here.
 */

export const STORAGE_KEYS = {
  /** The pure tracker's state, including the site being recorded right now. */
  trackerState: 'tracker:state',
  /** `true` while tracking is paused. A setting, not data: kept by "Delete everything". */
  trackingPaused: 'tracking:paused',
  /** The user's site labels. */
  categoryRules: 'categories:rules',
  /** The running focus session, or null. */
  activeSession: 'sessions:active',
  /** Finished focus sessions, oldest first. */
  sessionHistory: 'sessions:history',
} as const;

/** Finished activity records, one key per local day: `activity:2026-11-16`. */
export const ACTIVITY_DAY_PREFIX = 'activity:';
const ACTIVITY_DAY_PATTERN = /^activity:\d{4}-\d{2}-\d{2}$/;

export type FixedKeyName = keyof typeof STORAGE_KEYS;
export type KeyKind = FixedKeyName | 'activityDay' | 'unknown';

const BY_VALUE = new Map<string, FixedKeyName>(
  Object.entries(STORAGE_KEYS).map(([name, key]) => [key, name as FixedKeyName]),
);

/** What a stored key holds. `unknown` means no current code writes it. */
export function classifyKey(key: string): KeyKind {
  return BY_VALUE.get(key) ?? (ACTIVITY_DAY_PATTERN.test(key) ? 'activityDay' : 'unknown');
}

/** `2026-11-16` from `activity:2026-11-16`, or null for other keys. */
export function dayOfKey(key: string): string | null {
  return classifyKey(key) === 'activityDay' ? key.slice(ACTIVITY_DAY_PREFIX.length) : null;
}

/**
 * The keys "Delete everything" removes: every key in storage — including any unknown key, so
 * nothing can be missed — except the pause setting while tracking is paused (so deleting your
 * data never silently turns tracking back on).
 */
export function keysToDelete(stored: Record<string, unknown>): string[] {
  return Object.keys(stored).filter(
    (key) => !(key === STORAGE_KEYS.trackingPaused && stored[key] === true),
  );
}
