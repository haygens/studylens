/**
 * Retention (P12, privacy rule 6). Pure planning plus a tiny runner over the KeyValueStore
 * interface, so it is unit-testable with a fake clock and an in-memory store.
 *
 * Once per local day:
 * - Activity day buckets (`activity:YYYY-MM-DD`) for days more than RETENTION_DAYS before today
 *   are rolled into weekly totals per week (Monday start), site (domain group) and category, and
 *   the raw records are deleted. Records that cross local midnight are split, so each part counts
 *   toward the week of its own day.
 * - Finished sessions that ended more than RETENTION_DAYS before today are kept (Insights needs
 *   them) but compacted: the goal text and the friction/intention counts are removed.
 *
 * Safe to run twice and safe to interrupt. Step 1 is ONE `storage.set` (atomic in both Firefox
 * and Chromium) that writes the new weekly totals, empties the old buckets (`[]`), compacts the
 * old sessions, and stamps the run time. Step 2 removes the emptied buckets. If the background is
 * suspended between the steps, the next run finds empty old buckets: they add nothing and are
 * simply removed, so nothing is lost or counted twice. The background runs this through its task
 * queue, so no other write to these keys happens at the same time.
 */
import type { SiteCategory } from '@studylens/shared';
import { categoryOf, siteKey } from '../categories/rules';
import { NO_COUNTS } from '../interventions/interstitial';
import type { FocusSession } from '../sessions/session';
import { asSegments, type FullStore } from '../storage/activity-store';
import { asRules } from '../storage/categories-store';
import { STORAGE_KEYS, dayOfKey } from '../storage/keys';
import { asHistory } from '../storage/sessions-store';
import {
  localDayId,
  localDayIdBefore,
  localWeekStartId,
  splitAtLocalMidnight,
} from '../tracker/local-day';

/** Raw activity and full session details are kept for this many days before today. */
export const RETENTION_DAYS = 30;

const WEEKLY_KEY = STORAGE_KEYS.weeklyTotals;
const LAST_RUN_KEY = STORAGE_KEYS.retentionLastRun;
const HISTORY_KEY = STORAGE_KEYS.sessionHistory;

/** Time on one site in one week, rolled up from deleted raw records. */
export interface WeeklyTotal {
  /** Local day id of the Monday that starts the week, e.g. `2026-10-12`. */
  week: string;
  /** Domain group (registrable domain, or a subdomain with its own label), as when rolled up. */
  site: string;
  /** The site's label when it was rolled up (later label changes don't rewrite history). */
  category: SiteCategory;
  ms: number;
}

/**
 * The oldest local day still kept in full. With RETENTION_DAYS = 30, on Nov 18 that is Oct 19:
 * the Oct 19 bucket is kept, Oct 18 and earlier are rolled up. Data is never rolled up before it
 * is 30 full days old.
 */
export function oldestKeptDay(now: number): string {
  return localDayIdBefore(now, RETENTION_DAYS);
}

/** True if the job hasn't run yet today (local time), or the clock went backwards. */
export function isRetentionDue(lastRun: unknown, now: number): boolean {
  if (typeof lastRun !== 'number' || !Number.isFinite(lastRun) || lastRun > now) return true;
  return localDayId(lastRun) !== localDayId(now);
}

function isWeeklyTotal(value: unknown): value is WeeklyTotal {
  const v = value as WeeklyTotal | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.week === 'string' &&
    typeof v.site === 'string' &&
    typeof v.category === 'string' &&
    typeof v.ms === 'number' &&
    Number.isFinite(v.ms)
  );
}

export function asWeeklyTotals(value: unknown): WeeklyTotal[] {
  return Array.isArray(value) ? value.filter(isWeeklyTotal) : [];
}

const totalKey = (t: Pick<WeeklyTotal, 'week' | 'site' | 'category'>) =>
  `${t.week}|${t.site}|${t.category}`;

/** Adds `extra` into `totals` (same week + site + category merge). Newest week first. */
export function mergeWeeklyTotals(
  totals: readonly WeeklyTotal[],
  extra: readonly WeeklyTotal[],
): WeeklyTotal[] {
  const merged = new Map<string, WeeklyTotal>();
  for (const t of [...totals, ...extra]) {
    const key = totalKey(t);
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, ms: existing.ms + t.ms } : { ...t });
  }
  return [...merged.values()].sort(
    (a, b) => b.week.localeCompare(a.week) || b.ms - a.ms || a.site.localeCompare(b.site),
  );
}

/** A session past retention: the goal text and the friction/intention counts are dropped. */
export function compactSession(session: FocusSession): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...session };
  for (const name of Object.keys(NO_COUNTS)) delete rest[name];
  return { ...rest, goal: '', compacted: true };
}

export interface RetentionPlan {
  /** Written in one `storage.set` call (atomic). */
  set: Record<string, unknown>;
  /** Removed afterwards: old day buckets, all already emptied by `set`. */
  remove: string[];
  /** For logs and tests. */
  rolledDays: string[];
  compactedSessions: number;
}

/** What one retention run changes, from a full storage snapshot. Never changes `stored`. */
export function planRetention(stored: Record<string, unknown>, now: number): RetentionPlan {
  const keepFrom = oldestKeptDay(now);
  const rules = asRules(stored[STORAGE_KEYS.categoryRules]);
  const set: Record<string, unknown> = { [LAST_RUN_KEY]: now };
  const remove: string[] = [];
  const rolledDays: string[] = [];
  const additions: WeeklyTotal[] = [];

  for (const [key, value] of Object.entries(stored)) {
    const day = dayOfKey(key);
    if (!day || day >= keepFrom) continue;
    remove.push(key);
    const segments = asSegments(value);
    if (segments.length === 0) continue; // Already emptied by an interrupted run: just remove.
    rolledDays.push(day);
    set[key] = [];
    for (const seg of segments) {
      const site = siteKey(seg.hostname, rules);
      const category = categoryOf(seg.hostname, rules);
      for (const part of splitAtLocalMidnight(seg.start, seg.end)) {
        additions.push({
          week: localWeekStartId(part.start),
          site,
          category,
          ms: part.end - part.start,
        });
      }
    }
  }
  if (additions.length > 0) {
    set[WEEKLY_KEY] = mergeWeeklyTotals(asWeeklyTotals(stored[WEEKLY_KEY]), additions);
  }

  let compactedSessions = 0;
  const raw = stored[HISTORY_KEY];
  if (Array.isArray(raw)) {
    const next = raw.map((item: unknown) => {
      // Invalid entries are left exactly as they are (the readers already ignore them).
      const [session] = asHistory([item]);
      if (!session || session.compacted || localDayId(session.actualEnd) >= keepFrom) return item;
      compactedSessions++;
      return compactSession(session);
    });
    if (compactedSessions > 0) set[HISTORY_KEY] = next;
  }

  return { set, remove, rolledDays: rolledDays.sort(), compactedSessions };
}

/** Runs one retention pass: one atomic write, then removing the emptied buckets. */
export async function runRetention(store: FullStore, now: number): Promise<RetentionPlan> {
  const plan = planRetention(await store.getAll(), now);
  await store.set(plan.set);
  if (plan.remove.length > 0) await store.remove(plan.remove);
  return plan;
}

/** Runs the job if it hasn't run yet today. Called on every background wake-up and heartbeat. */
export async function runRetentionIfDue(
  store: FullStore,
  now: number,
): Promise<RetentionPlan | null> {
  const { [LAST_RUN_KEY]: lastRun } = await store.get([LAST_RUN_KEY]);
  return isRetentionDue(lastRun, now) ? runRetention(store, now) : null;
}
