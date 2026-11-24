/**
 * Replaced at build time by `define` in wxt.config.ts (and vitest.config.ts): `true` only in the
 * E2E test build (`wxt build --mode e2e`), `false` everywhere else.
 */
declare const __STUDYLENS_E2E__: boolean;

/**
 * The StudyLens server's base URL (no trailing slash), replaced at build time: production in
 * normal builds, a local test server in the E2E build (wxt.config.ts).
 */
declare const __STUDYLENS_API_BASE__: string;
