/**
 * The two permissions study groups need (P16), checked before every request to the server.
 *
 * 1. **Server access** — the optional host permission for the StudyLens server. Never at install;
 *    asked when the user clicks "Join or create a group". Needed for every request.
 * 2. **Sharing the display name** (Firefox only) — Firefox's optional data collection category
 *    `personallyIdentifyingInfo` (built-in data consent). Needed for every request that sends the
 *    display name or makes it visible to a group: register, rename, create, join. Edge has no such
 *    permission; there the in-app consent screen covers it.
 *
 * Why `getAll()` and not `contains()` for (2): Firefox only handles `data_collection` while its
 * pref `extensions.dataCollectionPermissions.enabled` is on. When it is off, `request()` silently
 * drops `data_collection` (granting just the origin) and `contains()` ignores it (returning true).
 * That is how a display name could be sent without the permission (hs's manual test, 2026-11-23).
 * `getAll()` only includes a `data_collection` list while the feature is on, so reading consent from
 * there can never report "granted" when Firefox didn't record it. If the feature is off, StudyLens
 * treats sharing as not allowed and explains why.
 */
import { OPTIONAL_DATA_COLLECTION } from '../../server-urls';
import { SERVER_ORIGIN_PATTERN } from './config';

/** The slice of `browser.permissions` used here (Firefox adds `data_collection`). */
export interface PermissionsApi {
  contains(p: { origins?: string[]; data_collection?: string[] }): Promise<boolean>;
  request(p: { origins?: string[]; data_collection?: string[] }): Promise<boolean>;
  remove(p: { origins?: string[]; data_collection?: string[] }): Promise<boolean>;
  getAll(): Promise<{ origins?: string[]; permissions?: string[]; data_collection?: string[] }>;
}

/**
 * Whether the display name may be sent:
 * - `not-needed`: not Firefox (Edge has no data collection permission).
 * - `granted`: Firefox recorded the user's OK for `personallyIdentifyingInfo`.
 * - `missing`: Firefox supports it, but it isn't granted (never asked, declined, or turned off).
 * - `unsupported`: this Firefox doesn't handle data collection permissions (feature switched off),
 *   so consent can't be recorded and the display name is never sent.
 */
export type NameSharing = 'not-needed' | 'granted' | 'missing' | 'unsupported';

export interface ServerAccess {
  server: boolean;
  nameSharing: NameSharing;
}

/** True when a request that sends (or reveals) the display name is allowed. */
export const canShareName = (a: ServerAccess): boolean =>
  a.server && (a.nameSharing === 'granted' || a.nameSharing === 'not-needed');

export function createServerAccess(api: PermissionsApi, isFirefox: boolean) {
  const origins = [SERVER_ORIGIN_PATTERN];
  const dataCollection = [...OPTIONAL_DATA_COLLECTION];

  async function nameSharing(): Promise<NameSharing> {
    if (!isFirefox) return 'not-needed';
    const all = await api.getAll();
    if (!Array.isArray(all.data_collection)) return 'unsupported';
    return dataCollection.every((c) => all.data_collection!.includes(c)) ? 'granted' : 'missing';
  }

  /** Never throws: an error counts as "not granted". */
  async function read(): Promise<ServerAccess> {
    try {
      const [server, sharing] = await Promise.all([api.contains({ origins }), nameSharing()]);
      return { server, nameSharing: sharing };
    } catch (err) {
      console.error('[StudyLens] reading permissions failed', err);
      return { server: false, nameSharing: isFirefox ? 'missing' : 'not-needed' };
    }
  }

  /**
   * Calls `request()` synchronously (browsers only allow it during a click), then reads back what
   * was really granted — the answer of `request()` alone isn't trusted.
   */
  function requestAndRead(p: { origins?: string[]; data_collection?: string[] }) {
    let asked: Promise<unknown>;
    try {
      asked = api.request(p).catch((err: unknown) => {
        console.error('[StudyLens] permissions.request failed', err);
      });
    } catch (err) {
      console.error('[StudyLens] permissions.request failed', err);
      asked = Promise.resolve();
    }
    return asked.then(read);
  }

  return {
    read,
    /**
     * "Join or create a group": one prompt for server access and (Firefox) sharing the display
     * name. Must be called straight from the click handler, before any `await`.
     */
    requestAll(): Promise<ServerAccess> {
      return requestAndRead(isFirefox ? { origins, data_collection: dataCollection } : { origins });
    },
    /** Firefox: ask only for sharing the display name (from its own click). */
    requestNameSharing(): Promise<ServerAccess> {
      return requestAndRead({ data_collection: dataCollection });
    },
    /** Firefox, after the user said no: give back server access too, so nothing is left granted. */
    async removeAll(): Promise<void> {
      try {
        await api.remove(isFirefox ? { origins, data_collection: dataCollection } : { origins });
      } catch (err) {
        // The E2E build has its local test server as a required permission, which can't be removed.
        console.info('[StudyLens] permissions.remove did not remove everything', err);
      }
    },
  };
}

export type ServerAccessApi = ReturnType<typeof createServerAccess>;

/**
 * The API client's check before every request: server access always; for requests that send or
 * reveal the display name, also the OK to share it (Firefox).
 */
export function permissionGate(access: Pick<ServerAccessApi, 'read'>) {
  return async (sendsName: boolean): Promise<'ok' | 'no-permission' | 'no-name-consent'> => {
    const a = await access.read();
    if (!a.server) return 'no-permission';
    if (sendsName && !canShareName(a)) return 'no-name-consent';
    return 'ok';
  };
}
