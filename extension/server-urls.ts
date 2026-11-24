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
 * (`none` required). Joining a study group sends a display name the user picks, which is the
 * "personallyIdentifyingInfo" category, so it is declared OPTIONAL and requested together with
 * the server permission when the user first clicks "Join or create a group". (Not
 * `technicalAndInteraction`: it is optional-only, and optional-only permissions can't be
 * requested together with other optional permissions.)
 */
export const OPTIONAL_DATA_COLLECTION = ['personallyIdentifyingInfo'];
