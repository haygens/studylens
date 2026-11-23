import { ApiError } from './errors';

/**
 * Microsoft Edge Add-ons store ID: the Edge build's origin is chrome-extension://<this>.
 * Firefox gives every install a random UUID origin (moz-extension://<uuid>), so Firefox origins
 * can't be pinned to one ID; any moz-extension:// UUID origin is allowed.
 *
 * CORS is not authentication: it only stops other websites from calling the API from a browser
 * page. Endpoints that touch device data also need the device's bearer token.
 */
export const EDGE_EXTENSION_ID = 'phepgpemnllainhhjemgknaeedjjekad';

const MOZ_EXTENSION =
  /^moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Unpacked dev builds in Edge get their own 32-letter (a–p) ID. */
const ANY_CHROMIUM_EXTENSION = /^chrome-extension:\/\/[a-p]{32}$/;
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isAllowedOrigin(origin: string, nodeEnv = process.env.NODE_ENV): boolean {
  if (origin === `chrome-extension://${EDGE_EXTENSION_ID}`) return true;
  if (MOZ_EXTENSION.test(origin)) return true;
  if (nodeEnv !== 'production') {
    return LOCALHOST.test(origin) || ANY_CHROMIUM_EXTENSION.test(origin);
  }
  return false;
}

const ALLOW_HEADERS = 'Authorization, Content-Type';
const MAX_AGE_SECONDS = '600';

/** Headers for an allowed origin. No cookies are used, so no Allow-Credentials. */
export function corsHeaders(origin: string, methods: string[]): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': [...methods, 'OPTIONS'].join(', '),
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': MAX_AGE_SECONDS,
  };
}

/**
 * Checks the request's Origin. No Origin header (curl, Vercel Cron, server-to-server) passes with
 * no CORS headers. A disallowed Origin is rejected with 403.
 *
 * @returns the CORS headers to add to the response (empty when there is no Origin).
 */
export function checkOrigin(req: Request, methods: string[]): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  if (!isAllowedOrigin(origin)) {
    throw new ApiError(403, 'origin_not_allowed', 'This origin may not call the StudyLens API.');
  }
  return corsHeaders(origin, methods);
}
