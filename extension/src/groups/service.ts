/**
 * Study groups (P16): what the "Study groups" tab, My Data and the background script do with the
 * server, as plain functions over injected dependencies (store, API client), so they are
 * unit-testable.
 *
 * The device is registered lazily: only when the user creates or joins their first group (after
 * the consent screen and the browser's permission prompt). Until then nothing is ever sent.
 */
import type {
  GroupOverviewResponse,
  GroupSharing,
  GroupSummary,
  ListGroupsResponse,
  UpdateSharingRequest,
} from '@studylens/shared';
import type { FullStore } from '../storage/activity-store';
import { isUnknownDevice, type ApiClient, type ApiFailure, type ApiResult } from './api-client';
import {
  clearGroupDevice,
  clearPendingDelete,
  loadGroupDevice,
  loadPendingDelete,
  loadSharingCache,
  saveGroupDevice,
  savePendingDelete,
  saveSharingCache,
  type GroupDevice,
} from './group-store';

export interface GroupDeps {
  store: FullStore;
  client: ApiClient;
  now?: () => number;
}

const fail = (failure: ApiFailure) => failure;

/** P18: keeps the local copy of my switches for one group in step with the server. */
async function rememberSharing(deps: GroupDeps, groupId: string, sharing: GroupSharing | null) {
  const cache = await loadSharingCache(deps.store);
  if (sharing) cache[groupId] = sharing;
  else delete cache[groupId];
  await saveSharingCache(deps.store, cache);
}

/**
 * The registered device with `displayName` on the server: registers it first if needed, or — if
 * it is already registered under another name (a create/join failed right after registering and
 * the user typed a different name for the retry) — changes the name on the server first.
 */
export async function ensureDevice(
  deps: GroupDeps,
  displayName: string,
): Promise<ApiResult<GroupDevice>> {
  const existing = await loadGroupDevice(deps.store);
  if (existing) {
    if (existing.displayName === displayName) return { ok: true, data: existing };
    const renamed = await deps.client.rename(existing.token, displayName);
    if (!renamed.ok) return renamed;
    const updated = { ...existing, displayName: renamed.data.displayName };
    await saveGroupDevice(deps.store, updated);
    return { ok: true, data: updated };
  }
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

/**
 * First use: register (if needed) with the display name, then create a group with my switches
 * (P18).
 */
export async function createGroup(
  deps: GroupDeps,
  displayName: string,
  groupName: string,
  sharing: GroupSharing,
): Promise<ApiResult<GroupSummary>> {
  const device = await ensureDevice(deps, displayName);
  if (!device.ok) return device;
  const res = await deps.client.createGroup(device.data.token, groupName, sharing);
  if (!res.ok) return res;
  await rememberSharing(deps, res.data.group.id, res.data.group.sharing);
  return { ok: true, data: res.data.group };
}

/**
 * First use: register (if needed) with the display name, then join by code with my switches
 * (P18; if I was already a member, the server keeps my old switches and returns them).
 */
export async function joinGroup(
  deps: GroupDeps,
  displayName: string,
  code: string,
  sharing: GroupSharing,
): Promise<ApiResult<GroupSummary>> {
  const device = await ensureDevice(deps, displayName);
  if (!device.ok) return device;
  const res = await deps.client.joinGroup(device.data.token, code, sharing);
  if (!res.ok) return res;
  await rememberSharing(deps, res.data.group.id, res.data.group.sharing);
  return { ok: true, data: res.data.group };
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
  // P18: the server's list is the truth about my groups and switches.
  if (res.ok) {
    await saveSharingCache(
      deps.store,
      Object.fromEntries(res.data.groups.map((g) => [g.id, g.sharing])),
    );
  }
  return res;
}

/** Leaving also forgets my switches for the group (the server deleted what it no longer shows). */
export async function leaveGroup(
  deps: GroupDeps,
  device: GroupDevice,
  groupId: string,
): Promise<ApiResult<{ ok: true }>> {
  const res = await deps.client.leaveGroup(device.token, groupId);
  if (res.ok || (res.kind === 'http' && res.status === 404)) {
    await rememberSharing(deps, groupId, null);
  }
  return res;
}

/**
 * P18: changes my switches for one group. Takes effect on the server at once; turning a switch
 * off there also deletes that data once no group shares it.
 */
export async function updateSharing(
  deps: GroupDeps,
  device: GroupDevice,
  groupId: string,
  patch: UpdateSharingRequest,
): Promise<ApiResult<GroupSharing>> {
  const res = await deps.client.updateSharing(device.token, groupId, patch);
  if (!res.ok) {
    if (res.kind === 'http' && res.status === 404) await rememberSharing(deps, groupId, null);
    return res;
  }
  await rememberSharing(deps, groupId, res.data.sharing);
  return { ok: true, data: res.data.sharing };
}

/** P18: what the members of a group see about each other. `today` = my local date. */
export function groupOverview(
  deps: GroupDeps,
  device: GroupDevice,
  groupId: string,
  today: string,
): Promise<ApiResult<GroupOverviewResponse>> {
  return deps.client.overview(device.token, groupId, today);
}

/**
 * P18, popup: how many friends are focusing now, or null when not registered / not allowed /
 * not reachable (the popup then just shows nothing). Never sends anything about me.
 */
export async function focusingFriends(deps: GroupDeps): Promise<number | null> {
  const device = await loadGroupDevice(deps.store);
  if (!device) return null;
  if (Object.keys(await loadSharingCache(deps.store)).length === 0) return null;
  const res = await deps.client.focusingNow(device.token);
  return res.ok ? res.data.count : null;
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
