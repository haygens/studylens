/**
 * Local storage for the user's site-category rules. Stays on the device (privacy rule 1).
 *
 * Key: `categories:rules` — array of `{ domain, category }`.
 */
import { isSiteCategory } from '@studylens/shared';
import { normalizeRuleDomain, sortRules, type CategoryRule } from '../categories/rules';
import type { KeyValueStore } from './activity-store';

export const RULES_KEY = 'categories:rules';

/** Drops anything malformed (e.g. hand-edited storage) and de-duplicates by domain (last wins). */
function asRules(value: unknown): CategoryRule[] {
  if (!Array.isArray(value)) return [];
  const byDomain = new Map<string, CategoryRule>();
  for (const item of value) {
    const v = item as Partial<CategoryRule> | null;
    if (typeof v !== 'object' || v === null || typeof v.domain !== 'string') continue;
    const domain = normalizeRuleDomain(v.domain);
    if (domain && isSiteCategory(v.category))
      byDomain.set(domain, { domain, category: v.category });
  }
  return sortRules([...byDomain.values()]);
}

export async function loadRules(store: KeyValueStore): Promise<CategoryRule[]> {
  const { [RULES_KEY]: saved } = await store.get([RULES_KEY]);
  return asRules(saved);
}

export async function saveRules(
  store: KeyValueStore,
  rules: readonly CategoryRule[],
): Promise<void> {
  await store.set({ [RULES_KEY]: asRules(rules) });
}
