import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { liveIdFromPath, liveNotFound, liveResponse, notInLiveSession } from '@/lib/api/live';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/group-sessions/<id>/heartbeat → 200 { serverNow, session } (P18b): I'm still focusing
 * in it (sent on the extension's 1-minute session tick). The answer carries the server's clock and
 * the shared end time, so the extension corrects its timer. No body. 404 if I'm not in it.
 */
export const POST = apiRoute('/api/group-sessions/[id]/heartbeat', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  const id = liveIdFromPath(new URL(req.url).pathname, 'heartbeat');
  if (!id) throw liveNotFound();
  await enforceRateLimit(db, RATE_LIMITS.liveHeartbeat, device.id, now);
  await db.heartbeatLiveSession(id, device.id, now);
  const session = await db.liveSession(id, device.id, now);
  if (!session) throw liveNotFound();
  if (session.me === null) throw notInLiveSession();
  return liveResponse(session);
});

export const OPTIONS = preflight(METHODS);
