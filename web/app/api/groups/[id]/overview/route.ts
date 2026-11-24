import { HISTORY_DAYS, type GroupOverviewResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { overviewToday } from '@/lib/api/activity';
import { requireDevice } from '@/lib/api/auth';
import { groupIdFromPath, notMember } from '@/lib/api/group-errors';
import { apiRoute, preflight } from '@/lib/api/handler';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const METHODS = ['GET'];

/**
 * GET /api/groups/<id>/overview?today=YYYY-MM-DD → 200 { group, today, members } (P18).
 *
 * What the members of a group see about each other: display name, and — only if that member
 * shares it in this group — today's focus minutes with a 7-day history, and whether they are
 * focusing now (heartbeat less than 3 minutes old). `null` means "not shared". `today` is the
 * viewer's local date (at most a day away from the server's UTC date; the server's UTC date when
 * left out). Never device IDs, sites, categories, goals or anything else. 404 if I'm not in it.
 */
export const GET = apiRoute('/api/groups/[id]/overview', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  const url = new URL(req.url);
  const groupId = groupIdFromPath(url.pathname, 'overview');
  if (!groupId) throw notMember();
  await enforceRateLimit(db, RATE_LIMITS.groupOverview, device.id, now);
  const today = overviewToday(url.searchParams.get('today'), now);
  const overview = await db.groupOverview(groupId, device.id, {
    now,
    today,
    historyDays: HISTORY_DAYS,
  });
  if (!overview) throw notMember();
  const body: GroupOverviewResponse = { ...overview, today };
  return Response.json(body);
});

export const OPTIONS = preflight(METHODS);
