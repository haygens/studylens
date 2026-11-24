import { describe, expect, it } from 'vitest';
import { SHARING_DEFAULT, type ListGroupsResponse } from '@studylens/shared';
import { groupIdFromPath } from '@/lib/api/group-errors';
import {
  createTestGroup,
  joinTestGroup,
  overviewMember,
  sendPresence,
  sendToday,
  setSharing,
} from '@/lib/api/group-test-helpers';
import { makeRequest, registerTestDevice, useTestDb } from '@/lib/api/test-helpers';
import { GET as list } from '../../route';

describe('PATCH /api/groups/:id/sharing', () => {
  const t = useTestDb();

  async function pair() {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await createTestGroup(sam, SHARING_DEFAULT);
    await joinTestGroup(alex, group.joinCode, SHARING_DEFAULT);
    await sendToday(sam, 45);
    await sendPresence(sam, 'start');
    return { sam, alex, group };
  }
  const count = async (table: string) =>
    (await t().sql.execute({ sql: `SELECT COUNT(*) AS n FROM ${table}` })).rows[0]!.n;

  it('turning "Share my focus minutes" off hides and deletes them at once', async () => {
    const { sam, alex, group } = await pair();
    expect((await overviewMember(alex, group.id, 'Sam'))?.todayMinutes).toBe(45);
    const res = await setSharing(sam, group.id, { focusMinutes: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sharing: { focusMinutes: false, focusingNow: true } });
    expect(await overviewMember(alex, group.id, 'Sam')).toMatchObject({
      todayMinutes: null,
      history: null,
      focusingNow: true,
    });
    expect(await count('daily_totals')).toBe(0);
    // My own list shows the new switches.
    const mine = (await (
      await list(makeRequest('GET', '/api/groups', { headers: sam.headers }))
    ).json()) as ListGroupsResponse;
    expect(mine.groups[0]?.sharing).toEqual({ focusMinutes: false, focusingNow: true });
  });

  it('turning "Show when I’m focusing" off hides and deletes presence at once', async () => {
    const { sam, alex, group } = await pair();
    await setSharing(sam, group.id, { focusingNow: false });
    expect((await overviewMember(alex, group.id, 'Sam'))?.focusingNow).toBeNull();
    expect(await count('device_presence')).toBe(0);
    // Back on: shown again only after the extension sends a new start/heartbeat.
    await setSharing(sam, group.id, { focusingNow: true });
    expect((await overviewMember(alex, group.id, 'Sam'))?.focusingNow).toBe(false);
    await sendPresence(sam, 'heartbeat');
    expect((await overviewMember(alex, group.id, 'Sam'))?.focusingNow).toBe(true);
  });

  it('keeps data another group still shares', async () => {
    const { sam, alex, group } = await pair();
    const kim = await registerTestDevice('Kim');
    const other = await createTestGroup(kim, SHARING_DEFAULT, 'Other');
    await joinTestGroup(sam, other.joinCode, SHARING_DEFAULT);
    await setSharing(sam, group.id, { focusMinutes: false, focusingNow: false });
    expect(await overviewMember(alex, group.id, 'Sam')).toMatchObject({
      todayMinutes: null,
      focusingNow: null,
    });
    expect(await overviewMember(kim, other.id, 'Sam')).toMatchObject({
      todayMinutes: 45,
      focusingNow: true,
    });
  });

  it('404 for a group I’m not in, or a bad id; 400 for an empty or unknown body', async () => {
    const { group } = await pair();
    const kim = await registerTestDevice('Kim');
    expect((await setSharing(kim, group.id, { focusMinutes: true })).status).toBe(404);
    expect((await setSharing(kim, 'not-a-uuid', { focusMinutes: true })).status).toBe(404);
    const { sam } = { sam: await registerTestDevice('Sam2') };
    await joinTestGroup(sam, group.joinCode, SHARING_DEFAULT);
    expect((await setSharing(sam, group.id, {})).status).toBe(400);
    expect((await setSharing(sam, group.id, { focusMinutes: 'yes' })).status).toBe(400);
    expect((await setSharing(sam, group.id, { sites: true })).status).toBe(400);
  });

  it('parses the group id only from its own path', () => {
    const id = '3fa29c01-b7d4-4e5f-9a1b-2c3d4e5f6a7b';
    expect(groupIdFromPath(`/api/groups/${id}/sharing`, 'sharing')).toBe(id);
    expect(groupIdFromPath(`/api/groups/${id}/sharing`, 'overview')).toBeNull();
    expect(groupIdFromPath(`/api/groups/${id}/sharing`)).toBeNull();
  });
});
