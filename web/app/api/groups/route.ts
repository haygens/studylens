import { randomUUID } from 'node:crypto';
import {
  MAX_GROUPS_PER_DEVICE,
  type GroupResponse,
  type ListGroupsResponse,
} from '@studylens/shared';
import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { enforceClientRateLimit } from '@/lib/api/client-limit';
import { ApiError } from '@/lib/api/errors';
import { tooManyGroups } from '@/lib/api/group-errors';
import { apiRoute, preflight } from '@/lib/api/handler';
import { generateJoinCode } from '@/lib/api/join-code';
import { CLIENT_RATE_LIMITS, RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';
import { createGroupSchema, readJson } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['GET', 'POST'];
/** A join-code collision is ~1 in 10^11 per attempt; a few retries is plenty. */
const CODE_ATTEMPTS = 5;

/** GET /api/groups → 200 { me: { displayName }, groups: [...] } — my groups and their members. */
export const GET = apiRoute('/api/groups', METHODS, async (req) => {
  const db = await getDb();
  const device = await requireDevice(req, db);
  const body: ListGroupsResponse = {
    me: { displayName: device.displayName },
    groups: await db.listGroups(device.id),
  };
  return Response.json(body);
});

/**
 * POST /api/groups { name } → 201 { group }. The creator is the owner and first member.
 * 409 `too_many_groups` when the device is already in 5 groups.
 */
export const POST = apiRoute('/api/groups', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  enforceClientRateLimit(req, CLIENT_RATE_LIMITS.createGroup, now);
  await enforceRateLimit(db, RATE_LIMITS.createGroup, device.id, now);
  const { name } = await readJson(req, createGroupSchema);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const id = randomUUID();
    const result = await db.createGroup(
      { id, name, joinCode: generateJoinCode(), deviceId: device.id, createdAt: now },
      MAX_GROUPS_PER_DEVICE,
    );
    if (result.status === 'too_many_groups') throw tooManyGroups();
    if (result.status === 'created') {
      const group = (await db.listGroups(device.id)).find((g) => g.id === id);
      if (!group) throw new Error('created group not found');
      const body: GroupResponse = { group };
      return Response.json(body, { status: 201 });
    }
  }
  throw new ApiError(500, 'internal_error', 'Could not make a unique join code. Try again.');
});

export const OPTIONS = preflight(METHODS);
