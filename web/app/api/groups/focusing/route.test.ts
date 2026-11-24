import { describe, expect, it } from 'vitest';
import { SHARING_DEFAULT } from '@studylens/shared';
import { createTestGroup, joinTestGroup, sendPresence } from '@/lib/api/group-test-helpers';
import {
  makeRequest,
  registerTestDevice,
  useTestDb,
  type TestDevice,
} from '@/lib/api/test-helpers';
import { GET } from './route';

const focusing = async (d: TestDevice | null) =>
  GET(makeRequest('GET', '/api/groups/focusing', { headers: d?.headers ?? {} }));

describe('GET /api/groups/focusing', () => {
  useTestDb();

  it('counts other members focusing now who share it, each once', async () => {
    const sam = await registerTestDevice('Sam');
    const alex = await registerTestDevice('Alex');
    const kim = await registerTestDevice('Kim');
    const g1 = await createTestGroup(sam, SHARING_DEFAULT);
    const g2 = await createTestGroup(sam, SHARING_DEFAULT, 'Second');
    for (const g of [g1, g2]) await joinTestGroup(alex, g.joinCode, SHARING_DEFAULT);
    await joinTestGroup(kim, g1.joinCode, { focusMinutes: true, focusingNow: false });

    expect(await (await focusing(sam)).json()).toEqual({ count: 0 });
    for (const d of [sam, alex, kim]) await sendPresence(d, 'start');
    // Alex is in both groups but counts once; Kim doesn't share it; Sam is me.
    expect(await (await focusing(sam)).json()).toEqual({ count: 1 });
    expect(await (await focusing(alex)).json()).toEqual({ count: 1 });
    await sendPresence(alex, 'stop');
    expect(await (await focusing(sam)).json()).toEqual({ count: 0 });
  });

  it('needs a token', async () => {
    expect((await focusing(null)).status).toBe(401);
  });
});
