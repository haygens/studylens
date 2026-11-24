import { describe, expect, it, vi } from 'vitest';
import { SHARING_OFF } from '@studylens/shared';
import { createApiClient } from './api-client';
import { SERVER_ORIGIN_PATTERN } from './config';
import {
  canShareActivity,
  canShareName,
  createServerAccess,
  permissionGate,
  type PermissionsApi,
} from './permission';

const PII = 'personallyIdentifyingInfo';
const TAI = 'technicalAndInteraction';
type Perms = { origins?: string[]; data_collection?: string[] };

/**
 * A fake `browser.permissions` that behaves like Firefox's code (ext-permissions.js):
 * - `featureOn` = the pref `extensions.dataCollectionPermissions.enabled`. When it is off,
 *   `request()` drops `data_collection`, `contains()` ignores it, and `getAll()` leaves it out.
 * - `answers`: what the user clicks in each prompt (true = Allow). Allow grants everything asked.
 * Edge (`browser: 'edge'`) has no data collection at all.
 */
function fakePermissions(opts: {
  browser: 'firefox' | 'edge';
  featureOn?: boolean;
  answers?: boolean[];
  granted?: Perms;
}) {
  const dataOn = opts.browser === 'firefox' && (opts.featureOn ?? true);
  const origins = new Set(opts.granted?.origins ?? []);
  const data = new Set(opts.granted?.data_collection ?? []);
  const answers = [...(opts.answers ?? [])];
  const requests: Perms[] = [];

  const api: PermissionsApi = {
    request: vi.fn(async (p: Perms) => {
      requests.push(p);
      const allow = answers.shift() ?? false;
      if (allow) {
        p.origins?.forEach((o) => origins.add(o));
        if (dataOn) p.data_collection?.forEach((d) => data.add(d));
      }
      return allow;
    }),
    contains: vi.fn(async (p: Perms) => {
      const okOrigins = (p.origins ?? []).every((o) => origins.has(o));
      const okData = !dataOn || (p.data_collection ?? []).every((d) => data.has(d));
      return okOrigins && okData;
    }),
    remove: vi.fn(async (p: Perms) => {
      p.origins?.forEach((o) => origins.delete(o));
      p.data_collection?.forEach((d) => data.delete(d));
      return true;
    }),
    getAll: vi.fn(async () => ({
      origins: [...origins],
      permissions: [],
      ...(dataOn && { data_collection: [...data] }),
    })),
  };
  return {
    api,
    requests,
    revokeData: () => data.delete(PII),
    revokeActivity: () => data.delete(TAI),
    revokeServer: () => origins.clear(),
  };
}

describe('server access + display-name consent', () => {
  it('Edge: one request for the server only; no data consent exists or is needed', async () => {
    const fake = fakePermissions({ browser: 'edge', answers: [true] });
    const access = createServerAccess(fake.api, false);
    expect(await access.read()).toEqual({
      server: false,
      nameSharing: 'not-needed',
      activitySharing: 'not-needed',
    });
    const after = await access.requestAll();
    expect(fake.requests).toEqual([{ origins: [SERVER_ORIGIN_PATTERN] }]);
    expect(after).toEqual({
      server: true,
      nameSharing: 'not-needed',
      activitySharing: 'not-needed',
    });
    expect(canShareName(after)).toBe(true);
  });

  it('Firefox, not requested yet: nothing granted', async () => {
    const access = createServerAccess(fakePermissions({ browser: 'firefox' }).api, true);
    const a = await access.read();
    expect(a).toEqual({ server: false, nameSharing: 'missing', activitySharing: 'missing' });
    expect(canShareName(a)).toBe(false);
  });

  it('Firefox, Allow: one prompt grants server access and sharing the name', async () => {
    const fake = fakePermissions({ browser: 'firefox', answers: [true] });
    const access = createServerAccess(fake.api, true);
    const a = await access.requestAll();
    expect(fake.requests).toEqual([
      { origins: [SERVER_ORIGIN_PATTERN], data_collection: [PII, TAI] },
    ]);
    expect(a).toEqual({ server: true, nameSharing: 'granted', activitySharing: 'granted' });
    expect(canShareName(a)).toBe(true);
    expect(canShareActivity(a)).toBe(true);
  });

  it('Firefox, declined: nothing granted', async () => {
    const access = createServerAccess(
      fakePermissions({ browser: 'firefox', answers: [false] }).api,
      true,
    );
    expect(await access.requestAll()).toEqual({
      server: false,
      nameSharing: 'missing',
      activitySharing: 'missing',
    });
  });

  it('Firefox with data collection switched off (hs’s manual test): never counts as granted', async () => {
    const fake = fakePermissions({ browser: 'firefox', featureOn: false, answers: [true] });
    const access = createServerAccess(fake.api, true);
    const a = await access.requestAll();
    // Firefox granted the origin and says "contains" for both, but recorded no data consent.
    expect(
      await fake.api.contains({ origins: [SERVER_ORIGIN_PATTERN], data_collection: [PII] }),
    ).toBe(true);
    expect(a).toEqual({ server: true, nameSharing: 'unsupported', activitySharing: 'unsupported' });
    expect(canShareName(a)).toBe(false);
  });

  it('Firefox: only server access granted → ask for the name on its own click', async () => {
    const fake = fakePermissions({
      browser: 'firefox',
      granted: { origins: [SERVER_ORIGIN_PATTERN] },
      answers: [true, true],
    });
    const access = createServerAccess(fake.api, true);
    expect(await access.read()).toEqual({
      server: true,
      nameSharing: 'missing',
      activitySharing: 'missing',
    });
    const a = await access.requestNameSharing();
    expect(fake.requests).toEqual([{ data_collection: [PII] }]);
    expect(a).toEqual({ server: true, nameSharing: 'granted', activitySharing: 'missing' });
    // P18: focus activity is asked on its own click (e.g. turning a switch on).
    const b = await access.requestActivitySharing();
    expect(fake.requests.at(-1)).toEqual({ data_collection: [TAI] });
    expect(b).toEqual({ server: true, nameSharing: 'granted', activitySharing: 'granted' });
  });

  it('Firefox: consent revoked later (about:addons) is noticed on the next check', async () => {
    const fake = fakePermissions({ browser: 'firefox', answers: [true] });
    const access = createServerAccess(fake.api, true);
    await access.requestAll();
    fake.revokeData();
    expect(await access.read()).toEqual({
      server: true,
      nameSharing: 'missing',
      activitySharing: 'granted',
    });
    fake.revokeActivity();
    const a = await access.read();
    expect(a.activitySharing).toBe('missing');
    expect(canShareActivity(a)).toBe(false);
  });

  it('calls request() synchronously, so it still counts as part of the click', () => {
    const fake = fakePermissions({ browser: 'firefox', answers: [true] });
    const access = createServerAccess(fake.api, true);
    void access.requestAll();
    expect(fake.api.request).toHaveBeenCalledTimes(1); // before any await
    void access.requestNameSharing();
    expect(fake.api.request).toHaveBeenCalledTimes(2);
  });

  it('a throwing permissions API counts as "not granted"', async () => {
    const api: PermissionsApi = {
      request: () => {
        throw new Error('not allowed outside a user action');
      },
      contains: async () => {
        throw new Error('boom');
      },
      remove: async () => true,
      getAll: async () => ({}),
    };
    const access = createServerAccess(api, true);
    expect(await access.requestAll()).toEqual({
      server: false,
      nameSharing: 'missing',
      activitySharing: 'missing',
    });
  });

  it('removeAll gives back both', async () => {
    const fake = fakePermissions({ browser: 'firefox', answers: [true] });
    const access = createServerAccess(fake.api, true);
    await access.requestAll();
    await access.removeAll();
    expect(await access.read()).toEqual({
      server: false,
      nameSharing: 'missing',
      activitySharing: 'missing',
    });
  });
});

describe('nothing that reveals the display name is sent without consent', () => {
  const NAME_REQUESTS = ['register', 'createGroup', 'joinGroup', 'rename'] as const;

  async function run(fake: ReturnType<typeof fakePermissions>, isFirefox: boolean) {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = createApiClient({
      base: 'https://api.test.invalid',
      fetch: fetchMock as unknown as typeof fetch,
      hasPermission: permissionGate(createServerAccess(fake.api, isFirefox)),
    });
    const results = {
      register: await client.register('Sam'),
      createGroup: await client.createGroup('t', 'G', SHARING_OFF),
      joinGroup: await client.joinGroup('t', 'ABCDEFGH', SHARING_OFF),
      rename: await client.rename('t', 'Sam'),
      listGroups: await client.listGroups('t'),
      leaveGroup: await client.leaveGroup('t', 'g1'),
      deleteDevice: await client.deleteDevice('t'),
    };
    return { results, fetchMock };
  }

  for (const [label, fake] of [
    ['not requested yet', () => fakePermissions({ browser: 'firefox' })],
    [
      'declined (server access only)',
      () => fakePermissions({ browser: 'firefox', granted: { origins: [SERVER_ORIGIN_PATTERN] } }),
    ],
    [
      'data collection switched off in Firefox',
      () =>
        fakePermissions({
          browser: 'firefox',
          featureOn: false,
          granted: { origins: [SERVER_ORIGIN_PATTERN] },
        }),
    ],
  ] as const) {
    it(`Firefox, ${label}: register/create/join/rename are not sent`, async () => {
      const { results, fetchMock } = await run(fake(), true);
      for (const name of NAME_REQUESTS) {
        expect(results[name], name).toMatchObject({ ok: false });
      }
      // Only token-only requests may have gone out: list (GET), leave and delete (DELETE).
      const sent = fetchMock.mock.calls.map((c) => {
        const [url, init] = c as unknown as [string, RequestInit];
        return `${init.method} ${url.replace('https://api.test.invalid', '')}`;
      });
      for (const s of sent) {
        expect(s).toMatch(
          /^(GET \/api\/groups|DELETE \/api\/groups\/g1\/membership|DELETE \/api\/devices\/me)$/,
        );
      }
      expect(sent.some((s) => s.startsWith('POST') || s.startsWith('PATCH'))).toBe(false);
    });
  }

  it('Firefox, server access but no name consent: only requests without the name may go out', async () => {
    const fake = fakePermissions({
      browser: 'firefox',
      granted: { origins: [SERVER_ORIGIN_PATTERN] },
    });
    const { results, fetchMock } = await run(fake, true);
    for (const name of NAME_REQUESTS) {
      expect(results[name]).toEqual({ ok: false, kind: 'no-name-consent' });
    }
    // Delete (and leave/list) send only the token, so the user can always delete their data.
    expect(results.deleteDevice.ok).toBe(true);
    const sent = fetchMock.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1].method);
    expect(sent.sort()).toEqual(['DELETE', 'DELETE', 'GET']);
  });

  it('Firefox, revoked after joining: name requests stop', async () => {
    const fake = fakePermissions({ browser: 'firefox', answers: [true] });
    await createServerAccess(fake.api, true).requestAll();
    fake.revokeData();
    const { results } = await run(fake, true);
    expect(results.rename).toEqual({ ok: false, kind: 'no-name-consent' });
  });

  it('Firefox with consent, and Edge with server access: everything is allowed', async () => {
    const firefox = fakePermissions({
      browser: 'firefox',
      granted: { origins: [SERVER_ORIGIN_PATTERN], data_collection: [PII, TAI] },
    });
    const edge = fakePermissions({
      browser: 'edge',
      granted: { origins: [SERVER_ORIGIN_PATTERN] },
    });
    for (const [fake, isFirefox] of [
      [firefox, true],
      [edge, false],
    ] as const) {
      const { results, fetchMock } = await run(fake, isFirefox);
      expect(Object.values(results).every((r) => r.ok)).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(7);
    }
  });

  it('no server access at all: nothing is sent', async () => {
    const { results, fetchMock } = await run(fakePermissions({ browser: 'edge' }), false);
    expect(Object.values(results).every((r) => !r.ok && r.kind === 'no-permission')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('P18: nothing about focus activity is sent without consent', () => {
  async function run(fake: ReturnType<typeof fakePermissions>, isFirefox: boolean) {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = createApiClient({
      base: 'https://api.test.invalid',
      fetch: fetchMock as unknown as typeof fetch,
      hasPermission: permissionGate(createServerAccess(fake.api, isFirefox)),
    });
    const results = {
      totals: await client.sendTotals('t', [{ localDate: '2026-11-23', focusMinutes: 5 }]),
      start: await client.sendPresence('t', 'start'),
      heartbeat: await client.sendPresence('t', 'heartbeat'),
      sharingOn: await client.updateSharing('t', 'g1', { focusMinutes: true }),
      stop: await client.sendPresence('t', 'stop'),
      sharingOff: await client.updateSharing('t', 'g1', {
        focusMinutes: false,
        focusingNow: false,
      }),
      overview: await client.overview('t', 'g1', '2026-11-23'),
    };
    const sent = fetchMock.mock.calls.map((c) => {
      const [url, init] = c as unknown as [string, RequestInit];
      return `${init.method} ${url.replace('https://api.test.invalid', '')}`;
    });
    return { results, sent };
  }

  it('Firefox without the activity OK: totals, presence and switching on are not sent', async () => {
    const fake = fakePermissions({
      browser: 'firefox',
      granted: { origins: [SERVER_ORIGIN_PATTERN], data_collection: [PII] },
    });
    const { results, sent } = await run(fake, true);
    for (const r of [results.totals, results.start, results.heartbeat, results.sharingOn]) {
      expect(r).toEqual({ ok: false, kind: 'no-activity-consent' });
    }
    // Ending presence, switching off and reading the overview reveal nothing new about me.
    expect(sent).toEqual([
      'POST /api/presence',
      'PATCH /api/groups/g1/sharing',
      'GET /api/groups/g1/overview?today=2026-11-23',
    ]);
  });

  it('Firefox with data collection switched off: never sent', async () => {
    const fake = fakePermissions({
      browser: 'firefox',
      featureOn: false,
      granted: { origins: [SERVER_ORIGIN_PATTERN] },
    });
    const { results } = await run(fake, true);
    expect(results.totals).toEqual({ ok: false, kind: 'no-activity-consent' });
  });

  it('Firefox with the OK, and Edge: everything goes out', async () => {
    for (const [fake, isFirefox] of [
      [
        fakePermissions({
          browser: 'firefox',
          granted: { origins: [SERVER_ORIGIN_PATTERN], data_collection: [PII, TAI] },
        }),
        true,
      ],
      [fakePermissions({ browser: 'edge', granted: { origins: [SERVER_ORIGIN_PATTERN] } }), false],
    ] as const) {
      const { results, sent } = await run(fake, isFirefox);
      expect(Object.values(results).every((r) => r.ok)).toBe(true);
      expect(sent).toHaveLength(7);
    }
  });

  it('no server access: nothing at all', async () => {
    const { sent } = await run(fakePermissions({ browser: 'edge' }), false);
    expect(sent).toEqual([]);
  });
});
