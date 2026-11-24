import { describe, expect, it } from 'vitest';
import {
  MAX_GROUPS_PER_DEVICE,
  isJoinCode,
  type ApiErrorBody,
  type GroupResponse,
  type ListGroupsResponse,
} from '@studylens/shared';
import { CLIENT_RATE_LIMITS, RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  EDGE_ORIGIN,
  makeRequest,
  registerTestDevice,
  useTestDb,
  type TestDevice,
} from '@/lib/api/test-helpers';
import { GET, OPTIONS, POST } from './route';
import { POST as join } from './join/route';

const create = (device: TestDevice | null, json: unknown, headers: Record<string, string> = {}) =>
  POST(makeRequest('POST', '/api/groups', { json, headers: { ...device?.headers, ...headers } }));
const list = (device: TestDevice) =>
  GET(makeRequest('GET', '/api/groups', { headers: device.headers }));

describe('POST /api/groups', () => {
  const t = useTestDb();

  it('creates a group with a fresh join code; the creator is the owner', async () => {
    const sam = await registerTestDevice('Sam');
    const res = await create(sam, { name: '  TCSS 490   study ' });
    expect(res.status).toBe(201);
    const { group } = (await res.json()) as GroupResponse;
    expect(group).toMatchObject({
      name: 'TCSS 490 study',
      role: 'owner',
      members: [{ displayName: 'Sam', role: 'owner', isMe: true }],
    });
    expect(isJoinCode(group.joinCode)).toBe(true);
    expect(group.id).toMatch(/^[0-9a-f-]{36}$/);
    const { rows } = await t().sql.execute({ sql: 'SELECT join_code, created_by FROM groups' });
    expect(rows).toEqual([{ join_code: group.joinCode, created_by: sam.deviceId }]);
  });

  it('needs a device token', async () => {
    const res = await create(null, { name: 'G' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
  });

  it('validates the name strictly (no emails, no URLs, no extra fields)', async () => {
    const sam = await registerTestDevice('Sam');
    for (const json of [
      { name: '' },
      { name: 'x'.repeat(41) },
      { name: 'me@uw.edu' },
      { name: 'https://evil.example' },
      { name: 'G', sites: ['youtube.com'] },
      {},
    ]) {
      const res = await create(sam, json);
      expect(res.status, JSON.stringify(json)).toBe(400);
      expect(((await res.json()) as ApiErrorBody).error.code).toBe('validation_failed');
    }
  });

  it(`stops at ${MAX_GROUPS_PER_DEVICE} groups per device (409 too_many_groups)`, async () => {
    const sam = await registerTestDevice('Sam');
    for (let i = 0; i < MAX_GROUPS_PER_DEVICE; i++) {
      expect((await create(sam, { name: `G${i}` })).status).toBe(201);
    }
    const res = await create(sam, { name: 'one more' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'too_many_groups' } });
  });

  it('rate-limits group creation per device', async () => {
    const sam = await registerTestDevice('Sam');
    // Leave each group right away so the 5-group limit never kicks in.
    const { DELETE: leave } = await import('./[id]/membership/route');
    for (let i = 0; i < RATE_LIMITS.createGroup.limit; i++) {
      const res = await create(sam, { name: `G${i}` });
      expect(res.status).toBe(201);
      const { group } = (await res.json()) as GroupResponse;
      await leave(
        makeRequest('DELETE', `/api/groups/${group.id}/membership`, { headers: sam.headers }),
      );
    }
    const res = await create(sam, { name: 'too many' });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('rate-limits group creation per client address too (in memory)', async () => {
    const devices = await Promise.all(
      [0, 1, 2, 3, 4, 5, 6].map((i) => registerTestDevice(`D${i}`, '198.51.100.7')),
    );
    let created = 0;
    let limited = 0;
    for (const d of devices) {
      for (let i = 0; i < MAX_GROUPS_PER_DEVICE; i++) {
        const status = (await create(d, { name: `G${i}` })).status;
        if (status === 201) created++;
        if (status === 429) limited++;
      }
    }
    expect(created).toBe(CLIENT_RATE_LIMITS.createGroup.limit);
    expect(limited).toBe(devices.length * MAX_GROUPS_PER_DEVICE - created);
    // Another address is not affected.
    const other = await registerTestDevice('Other', '198.51.100.8');
    expect((await create(other, { name: 'G' })).status).toBe(201);
  });

  it('allows the extension origin (CORS) and answers preflight with GET and POST', async () => {
    const sam = await registerTestDevice('Sam');
    const res = await create(sam, { name: 'G' }, { origin: EDGE_ORIGIN });
    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBe(EDGE_ORIGIN);
    const pre = await OPTIONS(
      makeRequest('OPTIONS', '/api/groups', { headers: { origin: EDGE_ORIGIN } }),
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
  });
});

describe('GET /api/groups', () => {
  useTestDb();

  it('lists my groups and their members, never other devices’ ids', async () => {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const { group } = (await (await create(sam, { name: 'Study' })).json()) as GroupResponse;
    await join(
      makeRequest('POST', '/api/groups/join', {
        json: { code: group.joinCode },
        headers: alex.headers,
      }),
    );

    const res = await list(alex);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as ListGroupsResponse;
    expect(body).toEqual({
      me: { displayName: 'Alex' },
      groups: [
        {
          id: group.id,
          name: 'Study',
          joinCode: group.joinCode,
          role: 'member',
          joinedAt: expect.any(Number),
          members: [
            { displayName: 'Sam', role: 'owner', isMe: false },
            { displayName: 'Alex', role: 'member', isMe: true },
          ],
          // P18: joined without choosing switches → both off.
          sharing: { focusMinutes: false, focusingNow: false },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain(sam.deviceId);
  });

  it('is empty for a device in no group, and needs a token', async () => {
    const sam = await registerTestDevice('Sam');
    expect(await (await list(sam)).json()).toEqual({ me: { displayName: 'Sam' }, groups: [] });
    expect((await GET(makeRequest('GET', '/api/groups'))).status).toBe(401);
  });
});
