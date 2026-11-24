import type { UpdateSharingResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { updateSharingSchema } from '@/lib/api/activity';
import { requireDevice } from '@/lib/api/auth';
import { groupIdFromPath, notMember } from '@/lib/api/group-errors';
import { apiRoute, preflight } from '@/lib/api/handler';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';
import { readJson } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['PATCH'];

/**
 * PATCH /api/groups/<id>/sharing { focusMinutes?, focusingNow? } → 200 { sharing } (P18).
 *
 * My switches for one group. Takes effect at once: the group's overview stops (or starts)
 * showing that data. Turning a switch off also deletes that data on the server as soon as none
 * of my groups shares it any more. 404 if I'm not in the group.
 */
export const PATCH = apiRoute('/api/groups/[id]/sharing', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  const groupId = groupIdFromPath(new URL(req.url).pathname, 'sharing');
  if (!groupId) throw notMember();
  await enforceRateLimit(db, RATE_LIMITS.updateSharing, device.id, now);
  const patch = await readJson(req, updateSharingSchema);
  const sharing = await db.updateSharing(groupId, device.id, patch);
  if (!sharing) throw notMember();
  const body: UpdateSharingResponse = { sharing };
  return Response.json(body);
});

export const OPTIONS = preflight(METHODS);
