/**
 * Local storage for the user's site-category rules. Stays on the device (privacy rule 1).
 *
 * Keys: `categories:rules` — array of `{ domain, category }`; `categories:version` — label-set
 * version, +1 on every change (P13c). While study mode is on (`study:label-lock`), labels can't
 * change.
 */
import { isSiteCategory } from '@studylens/shared';
import { normalizeRuleDomain, sortRules, type CategoryRule } from '../categories/rules';
import type { KeyValueStore } from './activity-store';
import { STORAGE_KEYS } from './keys';
import {
  LABEL_LOCK_KEY,
  LABEL_VERSION_KEY,
  asLabelLock,
  asLabelSetVersion,
} from './research-store';

export const RULES_KEY = STORAGE_KEYS.categoryRules;

/** Drops anything malformed (e.g. hand-edited storage) and de-duplicates by domain (last wins). */
export function asRules(value: unknown): CategoryRule[] {
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

export type SaveRulesResult = 'saved' | 'unchanged' | 'locked';

function sameRules(a: readonly CategoryRule[], b: readonly CategoryRule[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => r.domain === b[i]?.domain && r.category === b[i]?.category)
  );
}

/**
 * Saves the labels and bumps the label-set version when they really changed. Refused while study
 * mode is on (labels are frozen during the study).
 */
export async function saveRules(
  store: KeyValueStore,
  rules: readonly CategoryRule[],
): Promise<SaveRulesResult> {
  const stored = await store.get([RULES_KEY, LABEL_LOCK_KEY, LABEL_VERSION_KEY]);
  if (asLabelLock(stored[LABEL_LOCK_KEY]).locked) return 'locked';
  const next = asRules(rules);
  if (sameRules(next, asRules(stored[RULES_KEY]))) return 'unchanged';
  await store.set({
    [RULES_KEY]: next,
    [LABEL_VERSION_KEY]: asLabelSetVersion(stored[LABEL_VERSION_KEY]) + 1,
  });
  return 'saved';
}
