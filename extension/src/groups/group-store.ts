/**
 * Study groups (P16, P18), what is stored locally: this browser's server registration (device ID,
 * secret token, display name), my sharing switches per group, what was last sent, and, if "Delete
 * everything" couldn't reach the server, the token needed to finish deleting the server copy
 * later. Nothing about other members is stored.
 */
import { HISTORY_DAYS, addDays, type GroupSharing } from '@studylens/shared';
import type { FullStore, KeyValueStore } from '../storage/activity-store';
import { STORAGE_KEYS } from '../storage/keys';

export interface GroupDevice {
  deviceId: string;
  /** Secret bearer token. Never shown or exported in full. */
  token: string;
  displayName: string;
  /** Epoch ms. */
  registeredAt: number;
}

export interface PendingServerDelete {
  token: string;
  /** When "Delete everything" ran (epoch ms). */
  since: number;
  /** Last automatic retry (epoch ms), or null. */
  lastAttempt: number | null;
}

const DEVICE = STORAGE_KEYS.groupDevice;
const PENDING = STORAGE_KEYS.groupServerDeletePending;
const SHARING = STORAGE_KEYS.groupSharing;
const SYNC = STORAGE_KEYS.groupActivitySync;

/** My switches per group ID (P18). */
export type SharingCache = Record<string, GroupSharing>;

/** P18: what was last sent to the server. */
export interface ActivitySyncState {
  /** Focus minutes the server confirmed, per local date (only the last 7 days are kept). */
  sent: Record<string, number>;
  /** When totals were last sent (successfully or not), epoch ms; null = never. */
  lastTotalsAttempt: number | null;
  /** Whether the server shows me as "focusing now", as far as this browser knows. */
  presenceOn: boolean;
}

export const EMPTY_SYNC: ActivitySyncState = {
  sent: {},
  lastTotalsAttempt: null,
  presenceOn: false,
};

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function asGroupDevice(value: unknown): GroupDevice | null {
  const v = value as Partial<GroupDevice> | null;
  if (typeof v !== 'object' || v === null) return null;
  if (!isString(v.deviceId) || !isString(v.token) || !isString(v.displayName)) return null;
  return {
    deviceId: v.deviceId,
    token: v.token,
    displayName: v.displayName,
    registeredAt: typeof v.registeredAt === 'number' ? v.registeredAt : 0,
  };
}

export async function loadGroupDevice(store: KeyValueStore): Promise<GroupDevice | null> {
  return asGroupDevice((await store.get([DEVICE]))[DEVICE]);
}

export async function saveGroupDevice(store: KeyValueStore, device: GroupDevice): Promise<void> {
  await store.set({ [DEVICE]: device });
}

/** Forgets the registration and everything that belonged to it (switches, what was sent). */
export async function clearGroupDevice(store: FullStore): Promise<void> {
  await store.remove([DEVICE, SHARING, SYNC]);
}

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

export function asSharingCache(value: unknown): SharingCache {
  if (typeof value !== 'object' || value === null) return {};
  const out: SharingCache = {};
  for (const [id, s] of Object.entries(value as Record<string, unknown>)) {
    const v = s as Partial<GroupSharing> | null;
    if (v && isBool(v.focusMinutes) && isBool(v.focusingNow)) {
      out[id] = { focusMinutes: v.focusMinutes, focusingNow: v.focusingNow };
    }
  }
  return out;
}

export async function loadSharingCache(store: KeyValueStore): Promise<SharingCache> {
  return asSharingCache((await store.get([SHARING]))[SHARING]);
}

/** Whether any of my groups has each switch on. */
export function sharesAnywhere(cache: SharingCache): GroupSharing {
  const all = Object.values(cache);
  return {
    focusMinutes: all.some((s) => s.focusMinutes),
    focusingNow: all.some((s) => s.focusingNow),
  };
}

export function asSyncState(value: unknown): ActivitySyncState {
  const v = value as Partial<ActivitySyncState> | null;
  if (typeof v !== 'object' || v === null) return { ...EMPTY_SYNC, sent: {} };
  const sent: Record<string, number> = {};
  if (typeof v.sent === 'object' && v.sent !== null) {
    for (const [date, n] of Object.entries(v.sent)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(n) && n >= 0) sent[date] = n;
    }
  }
  return {
    sent,
    lastTotalsAttempt: typeof v.lastTotalsAttempt === 'number' ? v.lastTotalsAttempt : null,
    presenceOn: v.presenceOn === true,
  };
}

export async function loadSyncState(store: KeyValueStore): Promise<ActivitySyncState> {
  return asSyncState((await store.get([SYNC]))[SYNC]);
}

/** Saves the sync state, keeping only the last 7 days of `sent`. */
export async function saveSyncState(
  store: KeyValueStore,
  state: ActivitySyncState,
  today: string,
): Promise<void> {
  const oldest = addDays(today, 1 - HISTORY_DAYS);
  const sent = Object.fromEntries(Object.entries(state.sent).filter(([d]) => d >= oldest));
  await store.set({ [SYNC]: { ...state, sent } });
}

/**
 * Saves my switches. When a kind of data goes from "shared nowhere" to "shared somewhere", the
 * server has none of it (it deletes what no group shares), so the sync state forgets what was
 * sent and everything is sent again.
 */
export async function saveSharingCache(store: KeyValueStore, next: SharingCache): Promise<void> {
  const got = await store.get([SHARING, SYNC]);
  const before = sharesAnywhere(asSharingCache(got[SHARING]));
  const after = sharesAnywhere(next);
  const sync = asSyncState(got[SYNC]);
  let changed = false;
  if (!after.focusMinutes || (!before.focusMinutes && after.focusMinutes)) {
    if (Object.keys(sync.sent).length > 0 || sync.lastTotalsAttempt !== null) changed = true;
    sync.sent = {};
    sync.lastTotalsAttempt = null;
  }
  if (!after.focusingNow && sync.presenceOn) {
    sync.presenceOn = false;
    changed = true;
  }
  await store.set({ [SHARING]: next, ...(changed && { [SYNC]: sync }) });
}

/** True while this browser is in at least one study group (P18 covariate on each session). */
export async function isInGroup(store: KeyValueStore): Promise<boolean> {
  const got = await store.get([DEVICE, SHARING]);
  return (
    asGroupDevice(got[DEVICE]) !== null && Object.keys(asSharingCache(got[SHARING])).length > 0
  );
}

export async function loadPendingDelete(store: KeyValueStore): Promise<PendingServerDelete | null> {
  const v = (await store.get([PENDING]))[PENDING] as Partial<PendingServerDelete> | undefined;
  if (!v || !isString(v.token)) return null;
  return {
    token: v.token,
    since: typeof v.since === 'number' ? v.since : 0,
    lastAttempt: typeof v.lastAttempt === 'number' ? v.lastAttempt : null,
  };
}

export async function savePendingDelete(
  store: KeyValueStore,
  pending: PendingServerDelete,
): Promise<void> {
  await store.set({ [PENDING]: pending });
}

export async function clearPendingDelete(store: FullStore): Promise<void> {
  await store.remove([PENDING]);
}

/** `slt_AbC…` → `slt_AbC… (hidden)`: enough to recognize, useless to anyone who sees it. */
export function maskToken(token: string): string {
  return `${token.slice(0, 7)}… (hidden)`;
}
