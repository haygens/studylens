/**
 * Shared types used by the extension and the web app.
 * Placeholders for P1 — fields will firm up in P4 (sessions) and P8 (interventions).
 */

/** The research condition randomly assigned to a focus session. */
export const INTERVENTION_IDS = ['control', 'friction', 'intention'] as const;
export type InterventionId = (typeof INTERVENTION_IDS)[number];

export function isInterventionId(value: unknown): value is InterventionId {
  return typeof value === 'string' && (INTERVENTION_IDS as readonly string[]).includes(value);
}

/**
 * Aggregate summary of one focus session. Contains NO domains or site names —
 * this is the only shape that may ever leave the device (and only with consent).
 */
export interface SessionSummary {
  id: string;
  condition: InterventionId;
  /** Epoch milliseconds. */
  startedAt: number;
  /** Epoch milliseconds. */
  endedAt: number;
  focusMinutes: number;
  distractionMinutes: number;
  distractionVisits: number;
  /** Self-rated focus, 1–5. Undefined if the user skipped the check-in. */
  focusRating?: 1 | 2 | 3 | 4 | 5;
  goalCompleted?: boolean;
}

/** How the user labels a site. Unlabeled sites count as `neutral`. */
export const SITE_CATEGORIES = ['study', 'neutral', 'distraction'] as const;
export type SiteCategory = (typeof SITE_CATEGORIES)[number];

export function isSiteCategory(value: unknown): value is SiteCategory {
  return typeof value === 'string' && (SITE_CATEGORIES as readonly string[]).includes(value);
}
