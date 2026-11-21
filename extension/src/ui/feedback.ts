/**
 * "Send feedback" link (P13b). hs will create a Microsoft Form later; until FEEDBACK_URL is
 * set, the link is hidden everywhere. The link only opens the form in a new tab: StudyLens
 * sends nothing itself, and nothing is filled in for the user.
 */

/** Paste the Microsoft Form's https:// link here to show "Send feedback". Empty = hidden. */
export const FEEDBACK_URL = '';

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
