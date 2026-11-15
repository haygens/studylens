/**
 * Pure helpers that turn per-hostname totals into per-site rows for display.
 * Hostnames are stored as-is; grouping only happens here, when reading.
 */
import type { SiteCategory } from '@studylens/shared';
import type { HostTotal } from '../tracker/totals';
import { categoryOf, matchRule, siteKey, type CategoryRule } from './rules';

export interface SiteTotal {
  /** Registrable domain, or a more specific domain that has its own rule. */
  site: string;
  ms: number;
  category: SiteCategory;
  /** True if a user rule decided the category (false = neutral by default). */
  labeled: boolean;
  /** The raw hostnames that were merged into this row. */
  hostnames: string[];
}

/** Groups hostname totals into site rows, biggest time first. */
export function totalsBySite(
  totals: readonly HostTotal[],
  rules: readonly CategoryRule[],
): SiteTotal[] {
  const rows = new Map<string, SiteTotal>();
  for (const { hostname, ms } of totals) {
    const site = siteKey(hostname, rules);
    let row = rows.get(site);
    if (!row) {
      row = {
        site,
        ms: 0,
        category: categoryOf(site, rules),
        labeled: matchRule(site, rules) !== undefined,
        hostnames: [],
      };
      rows.set(site, row);
    }
    row.ms += ms;
    row.hostnames.push(hostname);
  }
  return [...rows.values()].sort((a, b) => b.ms - a.ms || a.site.localeCompare(b.site));
}

/** Site rows that no rule covers yet, most time first — candidates for quick labeling. */
export function unlabeledSites(
  totals: readonly HostTotal[],
  rules: readonly CategoryRule[],
): SiteTotal[] {
  return totalsBySite(totals, rules).filter((row) => !row.labeled);
}
