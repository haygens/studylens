import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { scrubMessage } from '@/lib/api/scrub';
import { errorReportSchema, readJson } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/errors { message, context?, extensionVersion? } → 202 { ok: true }.
 * Needs a device token; 20 reports per device per hour. The message is scrubbed (no URLs,
 * domains, emails or IPs) and stored WITHOUT the device ID. Deleted after 14 days.
 */
export const POST = apiRoute('/api/errors', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  await enforceRateLimit(db, RATE_LIMITS.errorReport, device.id, now);
  const report = await readJson(req, errorReportSchema);

  await db.addErrorLog({
    source: 'extension',
    route: report.context ?? null,
    message: scrubMessage(report.message) || '[empty]',
    extensionVersion: report.extensionVersion ?? null,
    createdAt: now,
  });
  return Response.json({ ok: true }, { status: 202 });
});

export const OPTIONS = preflight(METHODS);
