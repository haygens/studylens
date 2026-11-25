import type { ActiveLiveSessionsResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const METHODS = ['GET'];

/**
 * GET /api/group-sessions → 200 { serverNow, sessions } (P18b): the running live sessions in my
 * groups (at most one per group), with their participants. Polled every 15 s only while the
 * popup or the Study groups tab is open. Sends nothing about me (token only).
 */
export const GET = apiRoute('/api/group-sessions', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  await enforceRateLimit(db, RATE_LIMITS.listLive, device.id, now);
  const sessions = await db.listLiveSessions(device.id, now);
  const body: ActiveLiveSessionsResponse = { serverNow: Date.now(), sessions };
  return Response.json(body);
});

export const OPTIONS = preflight(METHODS);
