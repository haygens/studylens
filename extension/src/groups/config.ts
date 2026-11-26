/**
 * Study groups (P16): where the server is, and what the extension asks permission for.
 * The base URL is a build-time constant: production in normal builds, a local test server in the
 * E2E build (see server-urls.ts and wxt.config.ts).
 */
export const API_BASE: string = __STUDYLENS_API_BASE__;

/** The host permission pattern for the server, e.g. `https://studylens-flame.vercel.app/*`. */
export const SERVER_ORIGIN_PATTERN = `${API_BASE}/*`;

/** Store links for the invite message (packages/shared, also used by the web companion). */
export { INSTALL_LINKS } from '@studylens/shared/links';

/** How long one request may take (including reading the answer) before it counts as failed. */
export const REQUEST_TIMEOUT_MS = 10_000;
