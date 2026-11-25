import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { liveIdFromPath, liveNotFound, liveResponse, notInLiveSession } from '@/lib/api/live';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/group-sessions/<id>/leave → 200 { serverNow, session } (P18b): I leave early (status
 * `left`, my minutes counted up to now). The session keeps running for everyone else — also when
 * the host leaves — and ends when nobody is focusing in it any more. Leaving again, or after the
 * end, changes nothing (still 200). 404 if I'm not in it.
 */
export const POST = apiRoute('/api/group-sessions/[id]/leave', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  const id = liveIdFromPath(new URL(req.url).pathname, 'leave');
  if (!id) throw liveNotFound();
  await enforceRateLimit(db, RATE_LIMITS.leaveLive, device.id, now);
  await db.leaveLiveSession(id, device.id, now);
  const session = await db.liveSession(id, device.id, now);
  if (!session) throw liveNotFound();
  if (session.me === null) throw notInLiveSession();
  return liveResponse(session);
});

export const OPTIONS = preflight(METHODS);
