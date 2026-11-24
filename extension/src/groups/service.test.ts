import { describe, expect, it } from 'vitest';
import type { GroupSummary } from '@studylens/shared';
import { memoryStore } from '../storage/activity-store';
import { STORAGE_KEYS } from '../storage/keys';
import type { ApiClient, ApiFailure, ApiResult } from './api-client';
import { loadGroupDevice, loadPendingDelete, maskToken } from './group-store';
import {
  PENDING_DELETE_RETRY_MS,
  createGroup,
  deleteServerData,
  deleteServerDataBeforeDeleteEverything,
  joinGroup,
  listGroups,
  rememberPendingDelete,
  renameDevice,
  retryPendingDelete,
} from './service';

const T = Date.UTC(2026, 10, 24, 12);
const GROUP: GroupSummary = {
  id: 'g1',
  name: 'Study',
  joinCode: 'ABCDEFGH',
  role: 'owner',
  joinedAt: T,
  members: [{ displayName: 'Sam', role: 'owner', isMe: true }],
};
const OFFLINE: ApiFailure = { ok: false, kind: 'offline' };
const UNKNOWN: ApiFailure = {
  ok: false,
  kind: 'http',
  status: 401,
  code: 'unauthorized',
  message: 'Unknown or revoked token.',
};

/** A fake server that records calls. */
function fakeClient(overrides: Partial<Record<keyof ApiClient, () => ApiResult<unknown>>> = {}) {
  const calls: string[] = [];
  const answer =
    <T>(name: keyof ApiClient, fallback: T) =>
    async (...args: unknown[]) => {
      calls.push(`${name}(${args.join(', ')})`);
      return (overrides[name]?.() ?? { ok: true, data: fallback }) as ApiResult<T>;
    };
  const client = {
    register: answer('register', { deviceId: 'dev-1', token: 'slt_tok', displayName: 'Sam' }),
    listGroups: answer('listGroups', { me: { displayName: 'Sam' }, groups: [GROUP] }),
    createGroup: answer('createGroup', { group: GROUP }),
    joinGroup: answer('joinGroup', { group: { ...GROUP, role: 'member' } }),
    leaveGroup: answer('leaveGroup', { ok: true }),
    rename: answer('rename', { displayName: 'Samira' }),
    deleteDevice: answer('deleteDevice', { ok: true }),
  } as unknown as ApiClient;
  return { client, calls };
}

describe('study groups service', () => {
  it('registers once, on the first create, and stores the token locally', async () => {
    const store = memoryStore();
    const { client, calls } = fakeClient();
    const deps = { store, client, now: () => T };
    expect(await createGroup(deps, 'Sam', 'Study')).toEqual({ ok: true, data: GROUP });
    expect(await joinGroup(deps, 'Sam', 'ZZZZZZZZ')).toMatchObject({ ok: true });
    expect(calls).toEqual([
      'register(Sam)',
      'createGroup(slt_tok, Study)',
      'joinGroup(slt_tok, ZZZZZZZZ)',
    ]);
    expect(await loadGroupDevice(store)).toEqual({
      deviceId: 'dev-1',
      token: 'slt_tok',
      displayName: 'Sam',
      registeredAt: T,
    });
  });

  it('stores nothing if registration fails', async () => {
    const store = memoryStore();
    const { client, calls } = fakeClient({ register: () => OFFLINE });
    expect(await createGroup({ store, client }, 'Sam', 'Study')).toEqual(OFFLINE);
    expect(calls).toEqual(['register(Sam)']);
    expect(store.data).toEqual({});
  });

  it('keeps the local display name in step with the server', async () => {
    const store = memoryStore();
    const { client } = fakeClient({
      listGroups: () => ({ ok: true, data: { me: { displayName: 'Sammy' }, groups: [] } }),
    });
    const device = { deviceId: 'dev-1', token: 'slt_tok', displayName: 'Sam', registeredAt: T };
    await listGroups({ store, client }, device);
    expect((await loadGroupDevice(store))?.displayName).toBe('Sammy');
    expect(await renameDevice({ store, client }, device, 'Samira')).toEqual({
      ok: true,
      data: 'Samira',
    });
    expect((await loadGroupDevice(store))?.displayName).toBe('Samira');
  });

  it('deleteServerData forgets the device only once the server confirms (or never knew it)', async () => {
    const device = { deviceId: 'dev-1', token: 'slt_tok', displayName: 'Sam', registeredAt: T };
    const failing = memoryStore({ [STORAGE_KEYS.groupDevice]: device });
    expect(
      await deleteServerData({
        store: failing,
        client: fakeClient({ deleteDevice: () => OFFLINE }).client,
      }),
    ).toEqual(OFFLINE);
    expect(await loadGroupDevice(failing)).toEqual(device); // kept, so the user can retry

    for (const answer of [undefined, () => UNKNOWN]) {
      const store = memoryStore({ [STORAGE_KEYS.groupDevice]: device });
      const { client } = fakeClient(answer ? { deleteDevice: answer } : {});
      expect(await deleteServerData({ store, client })).toEqual({ ok: true, data: null });
      expect(store.data).toEqual({});
    }
  });
});

describe('Delete everything: the server part', () => {
  const device = { deviceId: 'dev-1', token: 'slt_tok', displayName: 'Sam', registeredAt: T };

  it('does nothing (and sends nothing) when not registered', async () => {
    const { client, calls } = fakeClient();
    expect(await deleteServerDataBeforeDeleteEverything({ store: memoryStore(), client })).toEqual({
      status: 'not-registered',
    });
    expect(calls).toEqual([]);
  });

  it('deletes on the server', async () => {
    const { client, calls } = fakeClient();
    const store = memoryStore({ [STORAGE_KEYS.groupDevice]: device });
    expect(await deleteServerDataBeforeDeleteEverything({ store, client })).toEqual({
      status: 'deleted',
    });
    expect(calls).toEqual(['deleteDevice(slt_tok)']);
  });

  it('offline: reports the failure with the token, then retries in the background', async () => {
    const store = memoryStore({ [STORAGE_KEYS.groupDevice]: device });
    const offline = fakeClient({ deleteDevice: () => OFFLINE });
    const step = await deleteServerDataBeforeDeleteEverything({ store, client: offline.client });
    expect(step).toEqual({ status: 'failed', failure: OFFLINE, token: 'slt_tok' });

    // The page deletes local data, then keeps only the token.
    await store.remove(Object.keys(store.data));
    await rememberPendingDelete({ store, client: offline.client, now: () => T }, 'slt_tok');
    expect(await loadPendingDelete(store)).toEqual({
      token: 'slt_tok',
      since: T,
      lastAttempt: null,
    });

    // Still offline: remembered with the attempt time; no new attempt for 30 minutes.
    expect(await retryPendingDelete({ store, client: offline.client }, T + 1000)).toBe('failed');
    expect(await retryPendingDelete({ store, client: offline.client }, T + 2000)).toBe('waiting');
    expect(offline.calls).toHaveLength(2);

    // Back online after 30 minutes: deleted, and the token is gone.
    const online = fakeClient();
    expect(
      await retryPendingDelete(
        { store, client: online.client },
        T + 1000 + PENDING_DELETE_RETRY_MS,
      ),
    ).toBe('deleted');
    expect(store.data).toEqual({});
    expect(await retryPendingDelete({ store, client: online.client }, T)).toBe('none');
  });

  it('a 401 on retry means the server data is already gone', async () => {
    const store = memoryStore();
    await rememberPendingDelete({ store, client: fakeClient().client }, 'slt_tok');
    const { client } = fakeClient({ deleteDevice: () => UNKNOWN });
    expect(await retryPendingDelete({ store, client }, T)).toBe('deleted');
    expect(store.data).toEqual({});
  });
});

describe('maskToken', () => {
  it('keeps only the start of the token', () => {
    const token = `slt_${'A'.repeat(43)}`;
    expect(maskToken(token)).toBe('slt_AAA… (hidden)');
    expect(maskToken(token)).not.toContain('A'.repeat(4));
  });
});
