import { describe, expect, it, vi } from 'vitest';
import { createApiClient, failureText, isUnknownDevice, type ApiFailure } from './api-client';

const BASE = 'https://api.test.invalid';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function client(fetchImpl: typeof fetch, opts: { permission?: boolean; timeoutMs?: number } = {}) {
  return createApiClient({
    base: BASE,
    fetch: fetchImpl,
    hasPermission: async () => ((opts.permission ?? true) ? 'ok' : 'no-permission'),
    timeoutMs: opts.timeoutMs,
  });
}

describe('API client', () => {
  it('sends JSON with the bearer token, no cookies and no referrer', async () => {
    const fetchMock = vi.fn(async () => json(201, { group: { id: 'g1' } }));
    const res = await client(fetchMock).createGroup('slt_tok', 'Study');
    expect(res).toEqual({ ok: true, data: { group: { id: 'g1' } } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/groups`);
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: 'Study' }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: { Authorization: 'Bearer slt_tok', 'Content-Type': 'application/json' },
    });
  });

  it('uses the right method and path for every endpoint', async () => {
    const calls: string[] = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url.slice(BASE.length)}`);
      return json(200, {});
    }) as unknown as typeof fetch;
    const c = client(fetchMock);
    await c.register('Sam');
    await c.listGroups('t');
    await c.joinGroup('t', 'ABCDEFGH');
    await c.leaveGroup('t', 'g/1');
    await c.rename('t', 'Samira');
    await c.deleteDevice('t');
    expect(calls).toEqual([
      'POST /api/devices',
      'GET /api/groups',
      'POST /api/groups/join',
      'DELETE /api/groups/g%2F1/membership',
      'PATCH /api/devices/me',
      'DELETE /api/devices/me',
    ]);
  });

  it('sends nothing without the permission', async () => {
    const fetchMock = vi.fn();
    const res = await client(fetchMock as unknown as typeof fetch, { permission: false }).register(
      'Sam',
    );
    expect(res).toEqual({ ok: false, kind: 'no-permission' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns server errors into values with the code, message and first field problem', async () => {
    const res = await client(async () =>
      json(400, {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Some fields are missing or invalid.',
          details: [{ path: 'name', message: 'Group name is required.' }],
        },
      }),
    ).createGroup('t', '');
    expect(res).toEqual({
      ok: false,
      kind: 'http',
      status: 400,
      code: 'validation_failed',
      message: 'Some fields are missing or invalid.',
      detail: 'Group name is required.',
    });
  });

  it('handles a non-JSON error page', async () => {
    const res = await client(
      async () => new Response('<html>Bad gateway</html>', { status: 502 }),
    ).listGroups('t');
    expect(res).toEqual({
      ok: false,
      kind: 'http',
      status: 502,
      code: 'unknown',
      message: 'HTTP 502',
    });
  });

  it('reports offline when fetch fails', async () => {
    const res = await client(async () => {
      throw new TypeError('Failed to fetch');
    }).listGroups('t');
    expect(res).toEqual({ ok: false, kind: 'offline' });
  });

  it('times out a request that never answers', async () => {
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as unknown as typeof fetch;
    const res = await client(hanging, { timeoutMs: 20 }).listGroups('t');
    expect(res).toEqual({ ok: false, kind: 'timeout' });
  });
});

describe('failure texts', () => {
  const http = (status: number, code: string, message = 'server says'): ApiFailure =>
    ({ ok: false, kind: 'http', status, code, message }) as ApiFailure;

  it('are plain sentences for every kind', () => {
    expect(failureText({ ok: false, kind: 'offline' })).toMatch(/Can’t reach the StudyLens server/);
    expect(failureText({ ok: false, kind: 'timeout' })).toMatch(/too long/);
    expect(failureText({ ok: false, kind: 'no-permission' })).toMatch(/nothing was sent/);
    expect(failureText(http(404, 'not_found', 'No group has this code.'))).toBe(
      'No group has this code.',
    );
    expect(failureText(http(409, 'group_full', 'Full.'))).toBe('Full.');
    expect(failureText(http(429, 'rate_limited', 'Too many.'))).toBe('Too many.');
    expect(failureText(http(401, 'unauthorized'))).toMatch(/doesn’t know this browser/);
    expect(failureText(http(500, 'internal_error'))).toMatch(/error 500/);
  });

  it('a 401 means the server no longer knows this device', () => {
    expect(isUnknownDevice(http(401, 'unauthorized'))).toBe(true);
    expect(isUnknownDevice(http(404, 'not_found'))).toBe(false);
    expect(isUnknownDevice({ ok: false, kind: 'offline' })).toBe(false);
  });
});
