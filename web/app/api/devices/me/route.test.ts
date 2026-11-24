import { describe, expect, it } from 'vitest';
import type { GroupResponse, ListGroupsResponse } from '@studylens/shared';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  EDGE_ORIGIN,
  makeRequest,
  registerTestDevice,
  useTestDb,
  type TestDevice,
} from '@/lib/api/test-helpers';
import { GET as list, POST as create } from '../../groups/route';
import { POST as join } from '../../groups/join/route';
import { DELETE, OPTIONS, PATCH } from './route';

const rename = (d: TestDevice, json: unknown) =>
  PATCH(makeRequest('PATCH', '/api/devices/me', { json, headers: d.headers }));
const remove = (d: TestDevice) =>
  DELETE(makeRequest('DELETE', '/api/devices/me', { headers: d.headers }));
const listRes = (d: TestDevice) => list(makeRequest('GET', '/api/groups', { headers: d.headers }));

describe('PATCH /api/devices/me', () => {
  useTestDb();

  it('changes my display name; other members see it', async () => {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const { group } = (await (
      await create(
        makeRequest('POST', '/api/groups', { json: { name: 'G' }, headers: sam.headers }),
      )
    ).json()) as GroupResponse;
    await join(
      makeRequest('POST', '/api/groups/join', {
        json: { code: group.joinCode },
        headers: alex.headers,
      }),
    );

    const res = await rename(sam, { displayName: '  Samira ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ displayName: 'Samira' });
    const body = (await (await listRes(alex)).json()) as ListGroupsResponse;
    expect(body.groups[0]?.members.map((m) => m.displayName)).toEqual(['Samira', 'Alex']);
  });

  it('validates like registration and rejects extra fields', async () => {
    const sam = await registerTestDevice('Sam');
    for (const json of [
      { displayName: '' },
      { displayName: 'a@b.co' },
      { displayName: 'S', x: 1 },
    ]) {
      expect((await rename(sam, json)).status, JSON.stringify(json)).toBe(400);
    }
  });

  it('rate-limits renames per device', async () => {
    const sam = await registerTestDevice('Sam');
    for (let i = 0; i < RATE_LIMITS.renameDevice.limit; i++) {
      expect((await rename(sam, { displayName: `S${i}` })).status).toBe(200);
    }
    expect((await rename(sam, { displayName: 'again' })).status).toBe(429);
  });
});

describe('DELETE /api/devices/me', () => {
  const t = useTestDb();

  it('deletes everything about the device; its token stops working', async () => {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const res1 = await create(
      makeRequest('POST', '/api/groups', { json: { name: 'Shared' }, headers: sam.headers }),
    );
    const shared = ((await res1.json()) as GroupResponse).group;
    await create(
      makeRequest('POST', '/api/groups', { json: { name: 'Solo' }, headers: sam.headers }),
    );
    await join(
      makeRequest('POST', '/api/groups/join', {
        json: { code: shared.joinCode },
        headers: alex.headers,
      }),
    );

    const res = await remove(sam);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const { rows } = await t().sql.execute({
      sql: `SELECT
        (SELECT COUNT(*) FROM devices WHERE id = ?) AS devices,
        (SELECT COUNT(*) FROM memberships WHERE device_id = ?) AS memberships,
        (SELECT COUNT(*) FROM groups WHERE created_by = ?) AS created,
        (SELECT COUNT(*) FROM groups) AS groups`,
      args: [sam.deviceId, sam.deviceId, sam.deviceId],
    });
    // Only "Shared" is left (Alex is still in it); "Solo" had nobody else and is gone.
    expect(rows[0]).toEqual({ devices: 0, memberships: 0, created: 0, groups: 1 });

    expect((await listRes(sam)).status).toBe(401);
    expect((await remove(sam)).status).toBe(401);
    const alexView = (await (await listRes(alex)).json()) as ListGroupsResponse;
    expect(alexView.groups[0]?.members).toEqual([
      { displayName: 'Alex', role: 'owner', isMe: true },
    ]);
  });

  it('preflight allows PATCH and DELETE from the extension', async () => {
    const pre = await OPTIONS(
      makeRequest('OPTIONS', '/api/devices/me', { headers: { origin: EDGE_ORIGIN } }),
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toBe('PATCH, DELETE, OPTIONS');
  });
});
