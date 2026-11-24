import { describe, expect, it } from 'vitest';
import type { GroupResponse, ListGroupsResponse } from '@studylens/shared';
import { groupIdFromPath } from '@/lib/api/group-errors';
import {
  makeRequest,
  registerTestDevice,
  useTestDb,
  type TestDevice,
} from '@/lib/api/test-helpers';
import { GET as list, POST as create } from '../../route';
import { POST as join } from '../../join/route';
import { DELETE } from './route';

const leave = (device: TestDevice | null, groupId: string) =>
  DELETE(
    makeRequest('DELETE', `/api/groups/${groupId}/membership`, { headers: device?.headers ?? {} }),
  );
const groupsOf = async (d: TestDevice) =>
  (
    (await (
      await list(makeRequest('GET', '/api/groups', { headers: d.headers }))
    ).json()) as ListGroupsResponse
  ).groups;

async function groupWith(owner: TestDevice, ...members: TestDevice[]) {
  const res = await create(
    makeRequest('POST', '/api/groups', { json: { name: 'Study' }, headers: owner.headers }),
  );
  const { group } = (await res.json()) as GroupResponse;
  for (const m of members) {
    await join(
      makeRequest('POST', '/api/groups/join', {
        json: { code: group.joinCode },
        headers: m.headers,
      }),
    );
  }
  return group;
}

describe('DELETE /api/groups/:id/membership', () => {
  const t = useTestDb();

  it('leaves a group; the others no longer see me', async () => {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await groupWith(sam, alex);

    const res = await leave(alex, group.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await groupsOf(alex)).toEqual([]);
    expect((await groupsOf(sam))[0]?.members.map((m) => m.displayName)).toEqual(['Sam']);
  });

  it('owner leaves: the next member becomes owner; last one out deletes the group', async () => {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await groupWith(sam, alex);
    await leave(sam, group.id);
    expect((await groupsOf(alex))[0]?.role).toBe('owner');
    await leave(alex, group.id);
    const { rows } = await t().sql.execute({ sql: 'SELECT COUNT(*) AS n FROM groups' });
    expect(rows[0]!.n).toBe(0);
  });

  it('404 when not a member, for unknown or malformed ids; 401 without a token', async () => {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await groupWith(sam);
    for (const id of [group.id, '00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
      const res = await leave(alex, id);
      expect(res.status, id).toBe(404);
      expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
    }
    expect((await leave(null, group.id)).status).toBe(401);
    // Sam is still in it.
    expect(await groupsOf(sam)).toHaveLength(1);
  });

  it('reads the group id from the path only when it is a UUID', () => {
    const id = '3fa29c01-b7d4-4e5f-9a1b-2c3d4e5f6a7b';
    expect(groupIdFromPath(`/api/groups/${id}/membership`)).toBe(id);
    expect(groupIdFromPath(`/api/groups/${id}/membership/`)).toBe(id);
    expect(groupIdFromPath('/api/groups/abc/membership')).toBeNull();
    expect(groupIdFromPath(`/api/groups/${id}/other`)).toBeNull();
  });
});
