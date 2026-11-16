/**
 * Test-only session lengths in seconds, so E2E tests don't wait whole minutes.
 * (The E2E build also ignores OS idle state — see readIdleState in browser-adapter.ts.)
 *
 * Only the E2E build (`__STUDYLENS_E2E__` = true) ever passes `enabled = true`; in the normal
 * Firefox/Edge builds the call sites are compiled away (see scripts/check-builds.mjs).
 */
export const MAX_TEST_SECONDS = 600;

/** Marker text that appears only in the E2E build. scripts/check-builds.mjs looks for it. */
export const E2E_BUILD_MARKER = 'studylens-e2e-build';

/** A valid seconds value from a popup message, or null (always null when not enabled). */
export function testSecondsFrom(value: unknown, enabled: boolean): number | null {
  if (!enabled) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= 1 && value <= MAX_TEST_SECONDS ? value : null;
}
