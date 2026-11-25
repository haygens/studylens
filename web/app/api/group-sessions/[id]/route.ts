import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { liveIdFromPath, liveNotFound, liveResponse } from '@/lib/api/live';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const METHODS = ['GET'];

/**
 * GET /api/group-sessions/<id> → 200 { serverNow, session } (P18b): one live session of my groups,
 * running or ended (its "Session complete!" summary), until the cleanup deletes it 24 h after the
 * end. 404 if it doesn't exist or isn't in my groups.
 */
export const GET = apiRoute('/api/group-sessions/[id]', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  const id = liveIdFromPath(new URL(req.url).pathname, null);
  if (!id) throw liveNotFound();
  await enforceRateLimit(db, RATE_LIMITS.liveState, device.id, now);
  const session = await db.liveSession(id, device.id, now);
  if (!session) throw liveNotFound();
  return liveResponse(session);
});

export const OPTIONS = preflight(METHODS);
