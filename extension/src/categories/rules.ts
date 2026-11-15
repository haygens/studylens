/**
 * Pure category-rule logic. A rule labels a domain and all of its subdomains; when several rules
 * match a hostname, the most specific (longest) domain wins. Unlabeled sites are `neutral`.
 * No browser APIs here, so everything is unit-testable.
 */
import { parse } from 'tldts';
import type { SiteCategory } from '@studylens/shared';
import { registrableDomain } from '../tracker/registrable-domain';

export interface CategoryRule {
  domain: string;
  category: SiteCategory;
}

export const DEFAULT_CATEGORY: SiteCategory = 'neutral';

/** True if `hostname` is `domain` itself or one of its subdomains. */
export function ruleMatches(domain: string, hostname: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** The most specific rule matching `hostname`, or undefined if none does. */
export function matchRule(
  hostname: string,
  rules: readonly CategoryRule[],
): CategoryRule | undefined {
  let best: CategoryRule | undefined;
  for (const rule of rules) {
    if (ruleMatches(rule.domain, hostname) && (!best || rule.domain.length > best.domain.length)) {
      best = rule;
    }
  }
  return best;
}

export function categoryOf(hostname: string, rules: readonly CategoryRule[]): SiteCategory {
  return matchRule(hostname, rules)?.category ?? DEFAULT_CATEGORY;
}

/**
 * The row a hostname is shown under: normally its registrable domain, but if a rule for a more
 * specific subdomain matches (e.g. `docs.google.com`), that subdomain gets its own row so a row
 * never mixes categories.
 */
export function siteKey(hostname: string, rules: readonly CategoryRule[]): string {
  const site = registrableDomain(hostname);
  const rule = matchRule(hostname, rules);
  if (rule && rule.domain !== site && ruleMatches(site, rule.domain)) return rule.domain;
  return site;
}

const HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

/**
 * Cleans what the user typed into a rule domain: accepts `YouTube.com`, `www.youtube.com`, or a
 * pasted URL (only the hostname is kept). Returns null for input that can't be a site, including
 * bare public suffixes like `com` or `co.uk`, which would label half the web.
 */
export function normalizeRuleDomain(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  if (text.includes('://')) {
    try {
      text = new URL(text).hostname;
    } catch {
      return null;
    }
  } else {
    text = text.split(/[/?#]/)[0] ?? '';
  }
  text = text.replace(/\.$/, '').replace(/^www\./, '');
  if (!HOST_PATTERN.test(text)) return null;
  const info = parse(text);
  if (!info.domain && !info.isIp && text !== 'localhost') return null;
  return text;
}

/** Adds a rule, or changes the category of the existing rule for the same domain. */
export function upsertRule(rules: readonly CategoryRule[], rule: CategoryRule): CategoryRule[] {
  const others = rules.filter((r) => r.domain !== rule.domain);
  return sortRules([...others, rule]);
}

export function removeRule(rules: readonly CategoryRule[], domain: string): CategoryRule[] {
  return rules.filter((r) => r.domain !== domain);
}

/** Renames a rule's domain (and/or changes its category). Replaces any rule already at `next`. */
export function replaceRule(
  rules: readonly CategoryRule[],
  oldDomain: string,
  next: CategoryRule,
): CategoryRule[] {
  return upsertRule(removeRule(rules, oldDomain), next);
}

export function sortRules(rules: readonly CategoryRule[]): CategoryRule[] {
  return [...rules].sort((a, b) => a.domain.localeCompare(b.domain));
}
