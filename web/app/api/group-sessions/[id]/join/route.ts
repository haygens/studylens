import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { liveBusy, liveIdFromPath, liveNotFound, liveOver, liveResponse } from '@/lib/api/live';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/group-sessions/<id>/join → 201 { serverNow, session } (joined) / 200 (already in it:
 * reconnecting after a restart or being offline) (P18b). Joining late is fine; everyone shares
 * the same end time. 409 `session_over` if it ended or I left it (leaving is final),
 * `session_running` if I'm in another live session; 404 if it isn't in my groups.
 */
export const POST = apiRoute('/api/group-sessions/[id]/join', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  const id = liveIdFromPath(new URL(req.url).pathname, 'join');
  if (!id) throw liveNotFound();
  await enforceRateLimit(db, RATE_LIMITS.joinLive, device.id, now);
  const joined = await db.joinLiveSession(id, device.id, now);
  const session = await db.liveSession(id, device.id, now);
  if (!session) throw liveNotFound();
  if (joined) return liveResponse(session, 201);
  if (session.me === 'focusing') return liveResponse(session);
  if (session.me === 'left') throw liveOver(true);
  if (session.state === 'ended' || session.me === 'finished') throw liveOver(false);
  throw liveBusy();
});

export const OPTIONS = preflight(METHODS);
