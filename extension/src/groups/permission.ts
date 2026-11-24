/**
 * The permissions study groups need (P16, P18), checked before every request to the server.
 *
 * 1. **Server access** — the optional host permission for the StudyLens server. Never at install;
 *    asked when the user clicks "Join or create a group". Needed for every request.
 * 2. **Sharing the display name** (Firefox only) — the optional data collection category
 *    `personallyIdentifyingInfo`. Needed for every request that sends the display name or makes
 *    it visible to a group: register, rename, create, join.
 * 3. **Sharing focus activity** (Firefox only, P18) — the optional category
 *    `technicalAndInteraction`. Needed for sending focus minutes and "focusing now", and for
 *    turning a sharing switch on.
 *
 * Edge has no data collection permissions; there the in-app consent screen and switches cover
 * (2) and (3). 1–3 are asked in ONE prompt from "Join or create a group".
 *
 * Why `getAll()` and not `contains()` for (2) and (3): Firefox only handles `data_collection`
 * while its pref `extensions.dataCollectionPermissions.enabled` is on. When it is off, `request()`
 * silently drops `data_collection` (granting just the origin) and `contains()` ignores it
 * (returning true). That is how a display name could be sent without the permission (hs's manual
 * test, 2026-11-23). `getAll()` only includes a `data_collection` list while the feature is on, so
 * reading consent from there can never report "granted" when Firefox didn't record it. If the
 * feature is off, StudyLens treats sharing as not allowed and explains why.
 */
import { ACTIVITY_DATA_COLLECTION, NAME_DATA_COLLECTION } from '../../server-urls';
import { SERVER_ORIGIN_PATTERN } from './config';

/** The slice of `browser.permissions` used here (Firefox adds `data_collection`). */
export interface PermissionsApi {
  contains(p: { origins?: string[]; data_collection?: string[] }): Promise<boolean>;
  request(p: { origins?: string[]; data_collection?: string[] }): Promise<boolean>;
  remove(p: { origins?: string[]; data_collection?: string[] }): Promise<boolean>;
  getAll(): Promise<{ origins?: string[]; permissions?: string[]; data_collection?: string[] }>;
}

/**
 * Whether one kind of data may be sent:
 * - `not-needed`: not Firefox (Edge has no data collection permission).
 * - `granted`: Firefox recorded the user's OK for the category.
 * - `missing`: Firefox supports it, but it isn't granted (never asked, declined, or turned off).
 * - `unsupported`: this Firefox doesn't handle data collection permissions (feature switched off),
 *   so consent can't be recorded and that data is never sent.
 */
export type DataConsent = 'not-needed' | 'granted' | 'missing' | 'unsupported';
/** P16 name, kept for readability where only the display name matters. */
export type NameSharing = DataConsent;

export interface ServerAccess {
  server: boolean;
  /** Firefox `personallyIdentifyingInfo`: the display name. */
  nameSharing: DataConsent;
  /** Firefox `technicalAndInteraction`: focus minutes and "focusing now" (P18). */
  activitySharing: DataConsent;
}

const allowed = (c: DataConsent) => c === 'granted' || c === 'not-needed';

/** True when a request that sends (or reveals) the display name is allowed. */
export const canShareName = (a: ServerAccess): boolean => a.server && allowed(a.nameSharing);

/** True when focus minutes and "focusing now" may be sent (P18). */
export const canShareActivity = (a: ServerAccess): boolean =>
  a.server && allowed(a.activitySharing);

/** What a request needs besides server access. */
export type ConsentNeed = 'none' | 'name' | 'activity';

export function createServerAccess(api: PermissionsApi, isFirefox: boolean) {
  const origins = [SERVER_ORIGIN_PATTERN];
  const allData = [NAME_DATA_COLLECTION, ACTIVITY_DATA_COLLECTION];

  async function consents(): Promise<Pick<ServerAccess, 'nameSharing' | 'activitySharing'>> {
    if (!isFirefox) return { nameSharing: 'not-needed', activitySharing: 'not-needed' };
    const all = await api.getAll();
    const granted = all.data_collection;
    if (!Array.isArray(granted)) {
      return { nameSharing: 'unsupported', activitySharing: 'unsupported' };
    }
    const of = (c: string): DataConsent => (granted.includes(c) ? 'granted' : 'missing');
    return { nameSharing: of(NAME_DATA_COLLECTION), activitySharing: of(ACTIVITY_DATA_COLLECTION) };
  }

  /** Never throws: an error counts as "not granted". */
  async function read(): Promise<ServerAccess> {
    try {
      const [server, c] = await Promise.all([api.contains({ origins }), consents()]);
      return { server, ...c };
    } catch (err) {
      console.error('[StudyLens] reading permissions failed', err);
      const fallback: DataConsent = isFirefox ? 'missing' : 'not-needed';
      return { server: false, nameSharing: fallback, activitySharing: fallback };
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
     * name and focus activity. Must be called straight from the click handler, before any `await`.
     */
    requestAll(): Promise<ServerAccess> {
      return requestAndRead(isFirefox ? { origins, data_collection: allData } : { origins });
    },
    /** Firefox: ask only for sharing the display name (from its own click). */
    requestNameSharing(): Promise<ServerAccess> {
      return requestAndRead({ data_collection: [NAME_DATA_COLLECTION] });
    },
    /** Firefox: ask for both data permissions (server access is already there). */
    requestDataSharing(): Promise<ServerAccess> {
      return requestAndRead({ data_collection: allData });
    },
    /** Firefox: ask only for sharing focus activity (from its own click, e.g. a switch). */
    requestActivitySharing(): Promise<ServerAccess> {
      return requestAndRead({ data_collection: [ACTIVITY_DATA_COLLECTION] });
    },
    /** Give back server access and the data permissions, so nothing is left granted. */
    async removeAll(): Promise<void> {
      try {
        await api.remove(isFirefox ? { origins, data_collection: allData } : { origins });
      } catch (err) {
        // The E2E build has its local test server as a required permission, which can't be removed.
        console.info('[StudyLens] permissions.remove did not remove everything', err);
      }
    },
  };
}

export type ServerAccessApi = ReturnType<typeof createServerAccess>;

export type GateResult = 'ok' | 'no-permission' | 'no-name-consent' | 'no-activity-consent';

/**
 * The API client's check before every request: server access always; for requests that send or
 * reveal the display name, also the OK to share it; for focus activity, the OK to share that
 * (Firefox).
 */
export function permissionGate(access: Pick<ServerAccessApi, 'read'>) {
  return async (need: ConsentNeed): Promise<GateResult> => {
    const a = await access.read();
    if (!a.server) return 'no-permission';
    if (need === 'name' && !canShareName(a)) return 'no-name-consent';
    if (need === 'activity' && !canShareActivity(a)) return 'no-activity-consent';
    return 'ok';
  };
}
