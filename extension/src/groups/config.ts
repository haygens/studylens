/**
 * Study groups (P16): where the server is, and what the extension asks permission for.
 * The base URL is a build-time constant: production in normal builds, a local test server in the
 * E2E build (see server-urls.ts and wxt.config.ts).
 */
import { OPTIONAL_DATA_COLLECTION } from '../../server-urls';

export const API_BASE: string = __STUDYLENS_API_BASE__;

/** The host permission pattern for the server, e.g. `https://studylens-flame.vercel.app/*`. */
export const SERVER_ORIGIN_PATTERN = `${API_BASE}/*`;

/** What `permissions.request/contains/remove` get. Firefox also gets its data collection category. */
export interface ServerPermissions {
  origins: string[];
  data_collection?: string[];
}

export function serverPermissions(isFirefox: boolean): ServerPermissions {
  return {
    origins: [SERVER_ORIGIN_PATTERN],
    ...(isFirefox && { data_collection: [...OPTIONAL_DATA_COLLECTION] }),
  };
}

/** Store links for the invite message. */
export const INSTALL_LINKS = {
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/studylens/',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/studylens/phepgpemnllainhhjemgknaeedjjekad',
} as const;

/** How long one request may take (including reading the answer) before it counts as failed. */
export const REQUEST_TIMEOUT_MS = 10_000;
