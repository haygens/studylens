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
  /** Feature flag for research interventions (P8). A setting; reset to default by "Delete everything". */
  interventionsEnabled: 'interventions:enabled',
  /**
   * `true` if the user turned research interventions off. A setting, not data: kept by "Delete
   * everything" while it is `true`, so deleting your data never silently turns them back on.
   */
  interventionsOptedOut: 'interventions:opted-out',
  /** Research conditions left in the current shuffled block (P8). */
  interventionBlock: 'interventions:block',
  /** `true` once the user answered the one-time research interventions notice (Keep on / Turn off). */
  interventionsNoticeSeen: 'interventions:notice-seen',
  /**
   * Friction (P9) and intention (P10) interventions: per-site grace periods and short-lived
   * bookkeeping for the running session. Site names, tab ids and times only — never a URL, and
   * never what the user typed on the intention page (that is not stored anywhere).
   */
  interstitialState: 'interstitial:state',
  /**
   * Retention (P12): activity older than 30 days, rolled up into time per week, site (domain
   * group) and category. The raw records for those days are deleted.
   */
  weeklyTotals: 'totals:weekly',
  /** Retention (P12): when the daily cleanup last ran (epoch ms). */
  retentionLastRun: 'retention:last-run',
  /**
   * The chosen look (P13b): `sunrise`, `ocean` or `pastel`. A setting; "Delete everything"
   * removes it, which resets it to the default (Sunrise).
   */
  theme: 'ui:theme',
  /** Welcome page (P13b): `pending` after a new install until it is finished, then `done`. */
  welcome: 'onboarding:welcome',
  /** `true` after updating from a version without themes, until the popup hint is dismissed. */
  themesHint: 'onboarding:themes-hint',
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

/** Settings kept by "Delete everything" while they are `true` (see keysToDelete). */
const KEPT_WHEN_TRUE = new Set<string>([
  STORAGE_KEYS.trackingPaused,
  STORAGE_KEYS.interventionsOptedOut,
]);

/**
 * The keys "Delete everything" removes: every key in storage — including any unknown key, so
 * nothing can be missed — except the pause setting while tracking is paused and the research
 * opt-out while opted out (so deleting your data never silently turns either back on).
 */
export function keysToDelete(stored: Record<string, unknown>): string[] {
  return Object.keys(stored).filter((key) => !(KEPT_WHEN_TRUE.has(key) && stored[key] === true));
}
