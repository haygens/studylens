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

/**
 * Segments of the same site separated by less than this (window focus changes, short idle,
 * Back/Forward through the friction/intention page) are one stretch on that site when counting
 * visits. Calculation only: stored segments are never changed.
 */
export const VISIT_MERGE_GAP_MS = 60_000;

function roundMinutes(ms: number): number {
  return Math.round(ms / 6_000) / 10;
}

/** A stretch of time on one site: same-site segments with gaps under VISIT_MERGE_GAP_MS. */
export interface SiteRun {
  site: string;
  category: SiteCategory;
  start: number;
  end: number;
}

/** Groups segments (any order) into runs per site. Gaps between different sites never merge. */
export function siteRuns(segments: readonly Segment[], rules: readonly CategoryRule[]): SiteRun[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
  const runs: SiteRun[] = [];
  for (const seg of sorted) {
    const site = siteKey(seg.hostname, rules);
    const last = runs[runs.length - 1];
    if (last && last.site === site && seg.start - last.end < VISIT_MERGE_GAP_MS) {
      last.end = Math.max(last.end, seg.end);
    } else {
      runs.push({
        site,
        category: categoryOf(seg.hostname, rules),
        start: seg.start,
        end: seg.end,
      });
    }
  }
  return runs;
}

/**
 * Distraction visits (definition v2, from 2026-11-18; see README "How measures are defined"):
 * a visit counts when the active site changes INTO a distraction site FROM a different site
 * (registrable domain, or a labeled subdomain), or when a distraction site is the first site
 * after the session started.
 *
 * - Coming back to the SAME distraction site never counts again, whatever the gap: another window
 *   (DevTools), another app, idle, the friction/intention page, or Back/Forward.
 * - The friction/intention page is an extension page, so the tracker never records it as a site
 *   (`trackableHostname` returns null): it is only a gap here.
 * - A distraction site that was open when the session started (or within the minute before) is
 *   not a visit until the user goes to a different site and comes back.
 * - Moving from one distraction site to a different one counts.
 */
export function countDistractionVisits(
  segments: readonly Segment[],
  start: number,
  end: number,
  rules: readonly CategoryRule[],
): number {
  // Only the minute before the session matters (it can merge into a run that is already open).
  const relevant = segments.filter((s) => s.end > start - VISIT_MERGE_GAP_MS && s.start < end);
  let visits = 0;
  let prevSite: string | null = null;
  for (const run of siteRuns(relevant, rules)) {
    if (run.category === 'distraction' && run.start >= start && run.site !== prevSite) visits++;
    prevSite = run.site;
  }
  return visits;
}

/** Time: each segment is clipped to [start, end) and added to its category. */
export function computeSessionStats(
  segments: readonly Segment[],
  start: number,
  end: number,
  rules: readonly CategoryRule[],
): SessionStats {
  const ms: Record<SiteCategory, number> = { study: 0, neutral: 0, distraction: 0 };
  for (const seg of segments) {
    const inside = Math.min(seg.end, end) - Math.max(seg.start, start);
    if (inside > 0) ms[categoryOf(seg.hostname, rules)] += inside;
  }
  return {
    minutesByCategory: {
      study: roundMinutes(ms.study),
      neutral: roundMinutes(ms.neutral),
      distraction: roundMinutes(ms.distraction),
    },
    distractionVisits: countDistractionVisits(segments, start, end, rules),
  };
}
