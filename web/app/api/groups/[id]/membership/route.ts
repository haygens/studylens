import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { groupIdFromPath, groupNotFound } from '@/lib/api/group-errors';
import { apiRoute, preflight } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

const METHODS = ['DELETE'];

/**
 * DELETE /api/groups/<id>/membership → 200 { ok: true }: leave the group. 404 if I'm not in it.
 * If the owner leaves, the longest-standing member becomes the owner; the last one out deletes
 * the group.
 */
export const DELETE = apiRoute('/api/groups/[id]/membership', METHODS, async (req) => {
  const db = await getDb();
  const device = await requireDevice(req, db);
  const groupId = groupIdFromPath(new URL(req.url).pathname);
  const notMember = () => groupNotFound('You are not in this group.');
  if (!groupId) throw notMember();
  if (!(await db.leaveGroup(groupId, device.id))) throw notMember();
  return Response.json({ ok: true });
});

export const OPTIONS = preflight(METHODS);
