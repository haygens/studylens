/**
 * Study groups (P16), what is stored locally: this browser's server registration (device ID,
 * secret token, display name) and, if "Delete everything" couldn't reach the server, the token
 * needed to finish deleting the server copy later. Nothing about groups' members is stored.
 */
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

export async function clearGroupDevice(store: FullStore): Promise<void> {
  await store.remove([DEVICE]);
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
