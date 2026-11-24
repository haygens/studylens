/**
 * The StudyLens server (study groups, P16), in one dependency-free place so the build config,
 * the E2E tests and scripts/check-builds.mjs agree.
 *
 * Normal builds talk to production; the E2E test build talks to a local copy of the web API that
 * the Playwright tests start (playwright.config.ts). The value is compiled into the extension as
 * `__STUDYLENS_API_BASE__` and also decides the host permission (wxt.config.ts).
 */
export const PRODUCTION_API_BASE = 'https://studylens-flame.vercel.app';
export const E2E_API_PORT = 3101;
export const E2E_API_BASE = `http://127.0.0.1:${E2E_API_PORT}`;

/**
 * Firefox data collection (built-in consent, Firefox 140+): nothing is collected by default
 * (`none` required). Both categories are OPTIONAL and requested together with the server
 * permission when the user first clicks "Join or create a group":
 *
 * - `personallyIdentifyingInfo` — the display name the user picks (P16).
 * - `technicalAndInteraction` — passive groups (P18): focus minutes per day and "focusing now".
 *   Mozilla's definition: "Device and browser info, extension usage and settings data, crash and
 *   error reports"; how the user "interacts with Firefox and the installed add-on". Focus minutes
 *   are extension usage data, not browsing activity (no websites, domains or categories are sent).
 *   It can only be optional. Firefox also offers it as a checkbox in the install dialog (checked
 *   by default), so it is NOT treated as the user's choice: nothing is sent before the user joins
 *   a group and leaves the in-app switches on, and turning it off stops sending.
 *
 * (Firefox's "optional-only" rule — request alone — applies to API permissions such as
 * `userScripts`, not to data collection categories.)
 */
export const NAME_DATA_COLLECTION = 'personallyIdentifyingInfo';
export const ACTIVITY_DATA_COLLECTION = 'technicalAndInteraction';
export const OPTIONAL_DATA_COLLECTION = [NAME_DATA_COLLECTION, ACTIVITY_DATA_COLLECTION];
