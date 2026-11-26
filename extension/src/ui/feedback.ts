/**
 * "Send feedback" link (P13b). Points at hs's anonymous Microsoft Form (no names or emails
 * asked). The link only opens the form in a new tab: StudyLens sends nothing itself, and
 * nothing is filled in for the user. Set FEEDBACK_URL to '' to hide the link everywhere.
 */

import { FEEDBACK_URL } from '@studylens/shared/links';

/** The Microsoft Form's https:// link that "Send feedback" opens (packages/shared). Empty = hidden. */
export { FEEDBACK_URL };

/** The link to show, or null to hide it (empty, or not a plain https:// address). */
export function feedbackLink(url: string = FEEDBACK_URL): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? trimmed : null;
  } catch {
    return null;
  }
}
