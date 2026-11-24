import { getDb } from '@/lib/db';
import { safeEqual } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { apiRoute } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cleanup — the daily Vercel Cron job (web/vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`. Deletes error logs older than 14 days, clears group
 * session goals 24 h after the end, and deletes stale presence rows, old rate-limit counters, and
 * daily focus totals older than 14 days (P18).
 */
export const GET = apiRoute('/api/cleanup', ['GET'], async (req) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new ApiError(503, 'not_configured', 'CRON_SECRET is not set on the server.');
  }
  const header = req.headers.get('authorization') ?? '';
  if (!safeEqual(header, `Bearer ${secret}`)) {
    throw new ApiError(401, 'unauthorized', 'Wrong or missing cron secret.');
  }
  const result = await (await getDb()).cleanup(Date.now());
  return Response.json({ ok: true, ...result });
});
