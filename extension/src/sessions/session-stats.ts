/**
 * Pure calculation of what happened during a focus session, from the activity segments (P2) and
 * the user's category rules (P3). No browser APIs here.
 */
import type { SiteCategory } from '@studylens/shared';
import { categoryOf, siteKey, type CategoryRule } from '../categories/rules';
import type { Segment } from '../tracker/tracker';

export interface SessionStats {
  /** Minutes per category inside the session, rounded to 0.1. */
  minutesByCategory: Record<SiteCategory, number>;
  distractionVisits: number;
}

function roundMinutes(ms: number): number {
  return Math.round(ms / 6_000) / 10;
}

/**
 * - Time: each segment is clipped to [start, end) and added to its category.
 * - Distraction visits: each time the active site switches INTO a distraction site during the
 *   session. A distraction segment counts as a visit when it starts inside the session, unless it
 *   directly continues the same site (e.g. `m.youtube.com` → `youtube.com` with no gap).
 *   Moving from one distraction site to a different one counts, and so does coming back to a
 *   distraction site after a gap (another app, idle, browser unfocused). A site that was already
 *   open when the session started is not a switch, so it is not counted (its minutes still are).
 */
export function computeSessionStats(
  segments: readonly Segment[],
  start: number,
  end: number,
  rules: readonly CategoryRule[],
): SessionStats {
  const ms: Record<SiteCategory, number> = { study: 0, neutral: 0, distraction: 0 };
  let distractionVisits = 0;

  const inside = segments
    .filter((s) => Math.min(s.end, end) - Math.max(s.start, start) > 0)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let prev: { site: string; end: number } | null = null;
  for (const seg of inside) {
    const category = categoryOf(seg.hostname, rules);
    const site = siteKey(seg.hostname, rules);
    ms[category] += Math.min(seg.end, end) - Math.max(seg.start, start);

    const continuesSameSite = prev !== null && prev.site === site && prev.end >= seg.start;
    if (category === 'distraction' && seg.start >= start && !continuesSameSite) {
      distractionVisits++;
    }
    prev = { site, end: seg.end };
  }

  return {
    minutesByCategory: {
      study: roundMinutes(ms.study),
      neutral: roundMinutes(ms.neutral),
      distraction: roundMinutes(ms.distraction),
    },
    distractionVisits,
  };
}
