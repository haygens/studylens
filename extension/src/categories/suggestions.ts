/**
 * Built-in suggestions shown on the options page. These are NEVER applied automatically —
 * a rule is only created when the user clicks Accept (individually or "Accept all").
 */
import type { CategoryRule } from './rules';

export const SUGGESTED_RULES: readonly CategoryRule[] = [
  { domain: 'youtube.com', category: 'distraction' },
  { domain: 'reddit.com', category: 'distraction' },
  { domain: 'x.com', category: 'distraction' },
  { domain: 'instagram.com', category: 'distraction' },
  { domain: 'tiktok.com', category: 'distraction' },
  { domain: 'netflix.com', category: 'distraction' },
  { domain: 'twitch.tv', category: 'distraction' },
  { domain: 'github.com', category: 'study' },
  { domain: 'stackoverflow.com', category: 'study' },
  { domain: 'wikipedia.org', category: 'study' },
  { domain: 'instructure.com', category: 'study' },
  { domain: 'docs.google.com', category: 'study' },
];

/** Suggestions the user hasn't already made a rule for (any category). */
export function pendingSuggestions(rules: readonly CategoryRule[]): CategoryRule[] {
  const taken = new Set(rules.map((r) => r.domain));
  return SUGGESTED_RULES.filter((s) => !taken.has(s.domain));
}
