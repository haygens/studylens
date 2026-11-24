import type { TotalsResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { assertPlausibleTotals, totalsSchema } from '@/lib/api/activity';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';
import { readJson } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/totals { days: [{ localDate, focusMinutes }] } → 200 { ok, stored } (P18).
 *
 * Saves (replaces) my focus minutes for 1–7 local dates. Only numbers: no sites, no categories.
 * Impossible values are rejected (400): more than 1440 minutes, a date that hasn't started
 * anywhere yet, more minutes than have passed on that date, or a date older than 7 days.
 * If none of my groups has "Share my focus minutes" on, nothing is saved (`stored: 0`) and any
 * totals the server still had are deleted.
 */
export const POST = apiRoute('/api/totals', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  await enforceRateLimit(db, RATE_LIMITS.sendTotals, device.id, now);
  const { days } = await readJson(req, totalsSchema);
  assertPlausibleTotals(days, now);
  const body: TotalsResponse = {
    ok: true,
    stored: await db.upsertDailyTotals(device.id, days, now),
  };
  return Response.json(body);
});

export const OPTIONS = preflight(METHODS);
