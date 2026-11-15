import type { Segment } from './tracker';

export interface HostTotal {
  hostname: string;
  ms: number;
}

/**
 * Sums time per hostname inside [from, to), clipping segments that cross the edges.
 * Sorted by time, biggest first.
 */
export function totalsByHostname(
  segments: readonly Segment[],
  from: number,
  to: number,
): HostTotal[] {
  const totals = new Map<string, number>();
  for (const seg of segments) {
    const ms = Math.min(seg.end, to) - Math.max(seg.start, from);
    if (ms > 0) totals.set(seg.hostname, (totals.get(seg.hostname) ?? 0) + ms);
  }
  return [...totals]
    .map(([hostname, ms]) => ({ hostname, ms }))
    .sort((a, b) => b.ms - a.ms || a.hostname.localeCompare(b.hostname));
}

/** Local-time start of the day containing `time`. */
export function startOfLocalDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
