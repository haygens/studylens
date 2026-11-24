import { MAX_GROUP_MEMBERS, MAX_GROUPS_PER_DEVICE, type GroupResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { enforceClientRateLimit } from '@/lib/api/client-limit';
import { groupFull, groupNotFound, tooManyGroups } from '@/lib/api/group-errors';
import { apiRoute, preflight } from '@/lib/api/handler';
import { CLIENT_RATE_LIMITS, RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';
import { joinGroupSchema, readJson } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/groups/join { code } → 201 { group } (joined) or 200 { group } (already a member).
 * 404 `not_found`, 409 `group_full` / `too_many_groups`.
 *
 * Every attempt counts toward two limits before the code is even looked at: per device
 * (database) and per client address (memory only). That makes guessing codes hopeless.
 */
export const POST = apiRoute('/api/groups/join', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  enforceClientRateLimit(req, CLIENT_RATE_LIMITS.joinGroup, now);
  await enforceRateLimit(db, RATE_LIMITS.joinGroup, device.id, now);
  const { code } = await readJson(req, joinGroupSchema);

  const result = await db.joinGroup(code, device.id, now, {
    maxMembers: MAX_GROUP_MEMBERS,
    maxGroupsPerDevice: MAX_GROUPS_PER_DEVICE,
  });
  switch (result.status) {
    case 'not_found':
      throw groupNotFound();
    case 'group_full':
      throw groupFull();
    case 'too_many_groups':
      throw tooManyGroups();
  }
  const group = (await db.listGroups(device.id)).find((g) => g.id === result.groupId);
  // The group was deleted between joining and reading it (everyone else left at that moment).
  if (!group) throw groupNotFound();
  const body: GroupResponse = { group };
  return Response.json(body, { status: result.status === 'joined' ? 201 : 200 });
});

export const OPTIONS = preflight(METHODS);
