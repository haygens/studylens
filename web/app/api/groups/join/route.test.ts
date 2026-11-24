import { describe, expect, it } from 'vitest';
import {
  MAX_GROUP_MEMBERS,
  MAX_GROUPS_PER_DEVICE,
  formatJoinCode,
  type GroupResponse,
} from '@studylens/shared';
import { CLIENT_RATE_LIMITS, RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  makeRequest,
  registerTestDevice,
  useTestDb,
  type TestDevice,
} from '@/lib/api/test-helpers';
import { POST as create } from '../route';
import { POST } from './route';

async function newGroup(owner: TestDevice, name = 'Study'): Promise<GroupResponse['group']> {
  const res = await create(
    makeRequest('POST', '/api/groups', { json: { name }, headers: owner.headers }),
  );
  return ((await res.json()) as GroupResponse).group;
}

const join = (device: TestDevice, json: unknown) =>
  POST(makeRequest('POST', '/api/groups/join', { json, headers: device.headers }));

describe('POST /api/groups/join', () => {
  useTestDb();

  it('joins by code, case-insensitive, with or without the dash (201, then 200)', async () => {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const group = await newGroup(sam);

    const res = await join(alex, { code: ` ${formatJoinCode(group.joinCode).toLowerCase()} ` });
    expect(res.status).toBe(201);
    const body = (await res.json()) as GroupResponse;
    expect(body.group).toMatchObject({
      id: group.id,
      role: 'member',
      members: [
        { displayName: 'Sam', isMe: false },
        { displayName: 'Alex', isMe: true },
      ],
    });
    // Joining again is fine and changes nothing.
    const again = await join(alex, { code: group.joinCode });
    expect(again.status).toBe(200);
    expect(((await again.json()) as GroupResponse).group.members).toHaveLength(2);
  });

  it('404 for an unknown code, 400 for a malformed one', async () => {
    const alex = await registerTestDevice('Alex');
    const unknown = await join(alex, { code: 'ZZZZ-ZZZZ' });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ ok: false, error: { code: 'not_found' } });
    for (const code of ['ABC', 'ABCD-EFG0', 'ABCDEFGHJK', 42]) {
      expect((await join(alex, { code })).status, String(code)).toBe(400);
    }
    expect((await join(alex, { code: 'ABCDEFGH', name: 'x' })).status).toBe(400);
  });

  it(`refuses member number ${MAX_GROUP_MEMBERS + 1} (409 group_full)`, async () => {
    const owner = await registerTestDevice('Owner', '192.0.2.1');
    const group = await newGroup(owner);
    for (let i = 1; i < MAX_GROUP_MEMBERS; i++) {
      // Spread over addresses to stay under the per-address registration limit.
      const d = await registerTestDevice(`M${i}`, `192.0.2.${10 + (i % 5)}`);
      expect((await join(d, { code: group.joinCode })).status).toBe(201);
    }
    const late = await registerTestDevice('Late', '192.0.2.99');
    const res = await join(late, { code: group.joinCode });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'group_full' } });
  });

  it(`refuses a device already in ${MAX_GROUPS_PER_DEVICE} groups (409 too_many_groups)`, async () => {
    const owner = await registerTestDevice('Owner');
    const alex = await registerTestDevice('Alex');
    for (let i = 0; i < MAX_GROUPS_PER_DEVICE; i++) await newGroup(alex, `Mine ${i}`);
    const group = await newGroup(owner);
    const res = await join(alex, { code: group.joinCode });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'too_many_groups' } });
  });

  it('counts every attempt (even wrong codes) per device: 429 after the limit', async () => {
    const owner = await registerTestDevice('Owner');
    const guesser = await registerTestDevice('Guesser', '192.0.2.50');
    const group = await newGroup(owner);
    for (let i = 0; i < RATE_LIMITS.joinGroup.limit; i++) {
      expect((await join(guesser, { code: 'ZZZZZZZZ' })).status).toBe(404);
    }
    // Even the right code is refused now.
    const res = await join(guesser, { code: group.joinCode });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('limits attempts per client address across devices (in memory)', async () => {
    const ip = '192.0.2.77';
    const devices = await Promise.all([0, 1, 2, 3].map((i) => registerTestDevice(`G${i}`, ip)));
    let notFound = 0;
    let limited = 0;
    for (const d of devices) {
      for (let i = 0; i < RATE_LIMITS.joinGroup.limit; i++) {
        const status = (await join(d, { code: 'ZZZZZZZZ' })).status;
        if (status === 404) notFound++;
        if (status === 429) limited++;
      }
    }
    expect(notFound).toBe(CLIENT_RATE_LIMITS.joinGroup.limit);
    expect(limited).toBe(devices.length * RATE_LIMITS.joinGroup.limit - notFound);
  });
});
