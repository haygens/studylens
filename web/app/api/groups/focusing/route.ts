import type { FocusingNowResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const METHODS = ['GET'];

/**
 * GET /api/groups/focusing → 200 { count } (P18): how many other members of my groups are
 * focusing right now and share that with me, each person counted once. Just a number, for the
 * popup's "2 friends focusing now" line (one request instead of one per group).
 */
export const GET = apiRoute('/api/groups/focusing', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  await enforceRateLimit(db, RATE_LIMITS.focusingNow, device.id, now);
  const body: FocusingNowResponse = { count: await db.countFocusingNow(device.id, now) };
  return Response.json(body);
});

export const OPTIONS = preflight(METHODS);
