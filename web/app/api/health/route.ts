import type { HealthResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { apiRoute, preflight } from '@/lib/api/handler';
import { VERSION } from '@/lib/version';

export const dynamic = 'force-dynamic';

const METHODS = ['GET'];

/** GET /api/health → { ok, db: "up" | "down", version }. 503 when the database is down. */
export const GET = apiRoute('/api/health', METHODS, async () => {
  let db: HealthResponse['db'] = 'down';
  try {
    await (await getDb()).ping();
    db = 'up';
  } catch (err) {
    // Not stored in error_logs: the database is the thing that's down.
    console.error('[/api/health] database check failed:', (err as Error).message);
  }
  const body: HealthResponse = { ok: db === 'up', db, version: VERSION };
  return Response.json(body, { status: db === 'up' ? 200 : 503 });
});

export const OPTIONS = preflight(METHODS);
