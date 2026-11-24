/**
 * Study groups (P16): what the "Study groups" tab, My Data and the background script do with the
 * server, as plain functions over injected dependencies (store, API client), so they are
 * unit-testable.
 *
 * The device is registered lazily: only when the user creates or joins their first group (after
 * the consent screen and the browser's permission prompt). Until then nothing is ever sent.
 */
import type { GroupSummary, ListGroupsResponse } from '@studylens/shared';
import type { FullStore } from '../storage/activity-store';
import { isUnknownDevice, type ApiClient, type ApiFailure, type ApiResult } from './api-client';
import {
  clearGroupDevice,
  clearPendingDelete,
  loadGroupDevice,
  loadPendingDelete,
  saveGroupDevice,
  savePendingDelete,
  type GroupDevice,
} from './group-store';

export interface GroupDeps {
  store: FullStore;
  client: ApiClient;
  now?: () => number;
}

const fail = (failure: ApiFailure) => failure;

/** The registered device, registering it with `displayName` first if needed. */
export async function ensureDevice(
  deps: GroupDeps,
  displayName: string,
): Promise<ApiResult<GroupDevice>> {
  const existing = await loadGroupDevice(deps.store);
  if (existing) return { ok: true, data: existing };
  const res = await deps.client.register(displayName);
  if (!res.ok) return fail(res);
  const device: GroupDevice = {
    deviceId: res.data.deviceId,
    token: res.data.token,
    displayName: res.data.displayName,
    registeredAt: (deps.now ?? Date.now)(),
  };
  await saveGroupDevice(deps.store, device);
  return { ok: true, data: device };
}

/** First use: register (if needed) with the display name, then create a group. */
export async function createGroup(
  deps: GroupDeps,
  displayName: string,
  groupName: string,
): Promise<ApiResult<GroupSummary>> {
  const device = await ensureDevice(deps, displayName);
  if (!device.ok) return device;
  const res = await deps.client.createGroup(device.data.token, groupName);
  return res.ok ? { ok: true, data: res.data.group } : res;
}

/** First use: register (if needed) with the display name, then join by code. */
export async function joinGroup(
  deps: GroupDeps,
  displayName: string,
  code: string,
): Promise<ApiResult<GroupSummary>> {
  const device = await ensureDevice(deps, displayName);
  if (!device.ok) return device;
  const res = await deps.client.joinGroup(device.data.token, code);
  return res.ok ? { ok: true, data: res.data.group } : res;
}

export async function listGroups(
  deps: GroupDeps,
  device: GroupDevice,
): Promise<ApiResult<ListGroupsResponse>> {
  const res = await deps.client.listGroups(device.token);
  // Keep the local copy of my display name in step with the server.
  if (res.ok && res.data.me.displayName !== device.displayName) {
    await saveGroupDevice(deps.store, { ...device, displayName: res.data.me.displayName });
  }
  return res;
}

export async function leaveGroup(
  deps: GroupDeps,
  device: GroupDevice,
  groupId: string,
): Promise<ApiResult<{ ok: true }>> {
  return deps.client.leaveGroup(device.token, groupId);
}

export async function renameDevice(
  deps: GroupDeps,
  device: GroupDevice,
  displayName: string,
): Promise<ApiResult<string>> {
  const res = await deps.client.rename(device.token, displayName);
  if (!res.ok) return res;
  await saveGroupDevice(deps.store, { ...device, displayName: res.data.displayName });
  return { ok: true, data: res.data.displayName };
}

/**
 * "Delete my group data from the server": deletes the device on the server, then forgets it
 * locally. If the server says the token is unknown, its data is already gone, so that counts as
 * success too. On any other failure the local registration is kept, so the user can try again.
 */
export async function deleteServerData(deps: GroupDeps): Promise<ApiResult<null>> {
  const device = await loadGroupDevice(deps.store);
  if (!device) return { ok: true, data: null };
  const res = await deps.client.deleteDevice(device.token);
  if (!res.ok && !isUnknownDevice(res)) return res;
  await clearGroupDevice(deps.store);
  return { ok: true, data: null };
}

export type DeleteEverythingServerStep =
  | { status: 'not-registered' }
  | { status: 'deleted' }
  /** The server couldn't be reached: the token to finish later. */
  | { status: 'failed'; failure: ApiFailure; token: string };

/**
 * The server part of "Delete everything" (My Data), run BEFORE the local data is deleted.
 * Never throws, and never stops the local delete: on failure the caller deletes local data anyway
 * and keeps only the token, with `rememberPendingDelete`, so the server copy can be deleted later.
 */
export async function deleteServerDataBeforeDeleteEverything(
  deps: GroupDeps,
): Promise<DeleteEverythingServerStep> {
  let device: GroupDevice | null = null;
  try {
    device = await loadGroupDevice(deps.store);
    if (!device) return { status: 'not-registered' };
    const res = await deps.client.deleteDevice(device.token);
    if (res.ok || isUnknownDevice(res)) return { status: 'deleted' };
    return { status: 'failed', failure: res, token: device.token };
  } catch (err) {
    console.error('[StudyLens] deleting server data failed', err);
    return device
      ? { status: 'failed', failure: { ok: false, kind: 'offline' }, token: device.token }
      : { status: 'not-registered' };
  }
}

/** After the local delete: keep only the token, so the background can finish the server delete. */
export async function rememberPendingDelete(deps: GroupDeps, token: string): Promise<void> {
  await savePendingDelete(deps.store, {
    token,
    since: (deps.now ?? Date.now)(),
    lastAttempt: null,
  });
}

/** How often the background retries a pending server delete. */
export const PENDING_DELETE_RETRY_MS = 30 * 60_000;

/**
 * Background (heartbeat): retries a pending server delete at most every 30 minutes. Removes the
 * pending token once the server confirms (or says the device is already gone).
 * @returns what happened, for logs and tests.
 */
export async function retryPendingDelete(
  deps: GroupDeps,
  now: number,
): Promise<'none' | 'waiting' | 'deleted' | 'failed'> {
  const pending = await loadPendingDelete(deps.store);
  if (!pending) return 'none';
  if (pending.lastAttempt !== null && now - pending.lastAttempt < PENDING_DELETE_RETRY_MS) {
    return 'waiting';
  }
  const res = await deps.client.deleteDevice(pending.token);
  if (res.ok || isUnknownDevice(res)) {
    await clearPendingDelete(deps.store);
    return 'deleted';
  }
  await savePendingDelete(deps.store, { ...pending, lastAttempt: now });
  return 'failed';
}
