import { PRESENCE_TTL_MS, type PresenceResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { presenceSchema } from '@/lib/api/activity';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';
import { readJson } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/presence { state: 'start' | 'heartbeat' | 'stop' } → 200 { ok, focusing } (P18).
 *
 * `start` (a focus session began) and `heartbeat` (once a minute while it runs) show me as
 * "focusing now" for 3 minutes; `stop` ends that at once. Nothing else is stored: no goal, no
 * session length. If none of my groups has "Show when I'm focusing" on, nothing is saved.
 */
export const POST = apiRoute('/api/presence', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  await enforceRateLimit(db, RATE_LIMITS.sendPresence, device.id, now);
  const { state } = await readJson(req, presenceSchema);
  const body: PresenceResponse = {
    ok: true,
    focusing: await db.setPresence(device.id, state, now, PRESENCE_TTL_MS),
  };
  return Response.json(body);
});

export const OPTIONS = preflight(METHODS);
