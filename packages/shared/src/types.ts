/**
 * Shared types used by the extension and the web app.
 * Fields firm up piece by piece: P4 (sessions), P5 (check-in), P8 (interventions).
 */

/** The research condition randomly assigned to a focus session. */
export const INTERVENTION_IDS = ['control', 'friction', 'intention'] as const;
export type InterventionId = (typeof INTERVENTION_IDS)[number];

export function isInterventionId(value: unknown): value is InterventionId {
  return typeof value === 'string' && (INTERVENTION_IDS as readonly string[]).includes(value);
}

/**
 * Recorded on a session when the user turned research interventions off. Never randomized:
 * analysis excludes these sessions.
 */
export const OPTED_OUT = 'opted-out' as const;

/**
 * Recorded on live group focus sessions (P18b, `mode: "group"`). Never randomized and never takes
 * a slot of the block randomization, so the solo conditions stay balanced. Excluded from the main
 * analysis. No helper page appears in these sessions.
 */
export const GROUP_CONDITION = 'group' as const;

/** What a session's `condition` field can hold (besides null = not assigned). */
export type SessionCondition = InterventionId | typeof OPTED_OUT | typeof GROUP_CONDITION;

export function isSessionCondition(value: unknown): value is SessionCondition {
  return value === OPTED_OUT || value === GROUP_CONDITION || isInterventionId(value);
}

/**
 * Aggregate summary of one focus session. Contains NO domains or site names —
 * this is the only shape that may ever leave the device (and only with consent).
 */
export interface SessionSummary {
  id: string;
  condition: SessionCondition;
  /** Epoch milliseconds. */
  startedAt: number;
  /** Epoch milliseconds. */
  endedAt: number;
  focusMinutes: number;
  distractionMinutes: number;
  distractionVisits: number;
  /** Self-rated focus, 1–5. Undefined if the user skipped the check-in. */
  focusRating?: FocusRating;
  /** Undefined if the user skipped the check-in. */
  goalCompleted?: GoalCompleted;
}

/** Answer to "Did you finish your goal?" (P5). */
export const GOAL_COMPLETED_VALUES = ['yes', 'partly', 'no'] as const;
export type GoalCompleted = (typeof GOAL_COMPLETED_VALUES)[number];

export function isGoalCompleted(value: unknown): value is GoalCompleted {
  return typeof value === 'string' && (GOAL_COMPLETED_VALUES as readonly string[]).includes(value);
}

/** Answer to "How focused were you?": 1 = very distracted … 5 = fully focused (P5). */
export const FOCUS_RATINGS = [1, 2, 3, 4, 5] as const;
export type FocusRating = (typeof FOCUS_RATINGS)[number];

export function isFocusRating(value: unknown): value is FocusRating {
  return typeof value === 'number' && (FOCUS_RATINGS as readonly number[]).includes(value);
}

/**
 * Why a check-in was skipped: the user pressed Skip, it stayed unanswered for too long, or a new
 * session started before it was answered. Kept apart so analysis can tell them apart.
 */
export const SKIP_REASONS = ['user', 'expired', 'new-session'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** End-of-session check-in, saved on the session. `answeredAt` is epoch milliseconds. */
export type CheckIn =
  | { goalCompleted: GoalCompleted; focusRating: FocusRating; answeredAt: number }
  | { skipped: true; reason: SkipReason; answeredAt: number };

export function isCheckIn(value: unknown): value is CheckIn {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.answeredAt !== 'number' || !Number.isFinite(v.answeredAt)) return false;
  if (v.skipped === true) {
    return (SKIP_REASONS as readonly unknown[]).includes(v.reason);
  }
  return isGoalCompleted(v.goalCompleted) && isFocusRating(v.focusRating);
}

/** How the user labels a site. Unlabeled sites count as `neutral`. */
export const SITE_CATEGORIES = ['study', 'neutral', 'distraction'] as const;
export type SiteCategory = (typeof SITE_CATEGORIES)[number];

export function isSiteCategory(value: unknown): value is SiteCategory {
  return typeof value === 'string' && (SITE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * How a session was run (P13c). `group` = a live group focus session (P18b, condition `group`);
 * everything else is `solo`. Group sessions are excluded from the main intervention analysis.
 */
export const SESSION_MODES = ['solo', 'group'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export function isSessionMode(value: unknown): value is SessionMode {
  return typeof value === 'string' && (SESSION_MODES as readonly string[]).includes(value);
}

/**
 * What happened after a distraction attempt (P13c): in control sessions the site simply loaded
 * (`visited`); with friction or intention the user pressed Continue (`continued`) or Back to
 * studying (`turned_back`).
 */
export const ATTEMPT_OUTCOMES = ['visited', 'continued', 'turned_back'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

export function isAttemptOutcome(value: unknown): value is AttemptOutcome {
  return typeof value === 'string' && (ATTEMPT_OUTCOMES as readonly string[]).includes(value);
}
