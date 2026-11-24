/** Helpers for the P18 route tests: groups made through the real routes, and API calls. */
import {
  utcDate,
  type GroupOverviewResponse,
  type GroupResponse,
  type GroupSharing,
} from '@studylens/shared';
import type { RateLimitRule } from './rate-limit';
import { makeRequest, type TestDevice } from './test-helpers';
import type { TestDb } from '@/lib/db/test-utils';

/** Uses up a device's whole allowance for `rule` in the current window (fast, no requests). */
export async function useUpRateLimit(t: TestDb, rule: RateLimitRule, device: TestDevice) {
  const windowStart = Math.floor(Date.now() / rule.windowMs) * rule.windowMs;
  await t.sql.execute({
    sql: `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)
          ON CONFLICT (key, window_start) DO UPDATE SET count = excluded.count`,
    args: [`${rule.name}:${device.deviceId}`, windowStart, rule.limit],
  });
}

export async function createTestGroup(
  owner: TestDevice,
  sharing?: GroupSharing,
  name = 'Study',
): Promise<GroupResponse['group']> {
  const { POST } = await import('@/app/api/groups/route');
  const res = await POST(
    makeRequest('POST', '/api/groups', {
      json: sharing ? { name, sharing } : { name },
      headers: owner.headers,
    }),
  );
  if (res.status !== 201) throw new Error(`create failed: ${res.status}`);
  return ((await res.json()) as GroupResponse).group;
}

export async function joinTestGroup(
  member: TestDevice,
  code: string,
  sharing?: GroupSharing,
): Promise<Response> {
  const { POST } = await import('@/app/api/groups/join/route');
  return POST(
    makeRequest('POST', '/api/groups/join', {
      json: sharing ? { code, sharing } : { code },
      headers: member.headers,
    }),
  );
}

export async function sendTotals(device: TestDevice, json: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/totals/route');
  return POST(makeRequest('POST', '/api/totals', { json, headers: device.headers }));
}

/** Today's (UTC) focus minutes for `device`. */
export const sendToday = (device: TestDevice, focusMinutes: number) =>
  sendTotals(device, { days: [{ localDate: utcDate(Date.now()), focusMinutes }] });

export async function sendPresence(device: TestDevice, state: string): Promise<Response> {
  const { POST } = await import('@/app/api/presence/route');
  return POST(makeRequest('POST', '/api/presence', { json: { state }, headers: device.headers }));
}

export async function setSharing(
  device: TestDevice,
  groupId: string,
  json: unknown,
): Promise<Response> {
  const { PATCH } = await import('@/app/api/groups/[id]/sharing/route');
  return PATCH(
    makeRequest('PATCH', `/api/groups/${groupId}/sharing`, { json, headers: device.headers }),
  );
}

export async function fetchOverview(
  device: TestDevice,
  groupId: string,
  query = '',
): Promise<Response> {
  const { GET } = await import('@/app/api/groups/[id]/overview/route');
  return GET(
    makeRequest('GET', `/api/groups/${groupId}/overview${query}`, { headers: device.headers }),
  );
}

/** The overview's members, failing loudly if the request didn't work. */
export async function overviewMembers(device: TestDevice, groupId: string) {
  const res = await fetchOverview(device, groupId);
  if (res.status !== 200) throw new Error(`overview failed: ${res.status}`);
  return ((await res.json()) as GroupOverviewResponse).members;
}

/** One member of the overview, by display name (members joining in the same ms have no fixed order). */
export async function overviewMember(device: TestDevice, groupId: string, name: string) {
  return (await overviewMembers(device, groupId)).find((m) => m.displayName === name);
}
