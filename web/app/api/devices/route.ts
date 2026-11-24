import { randomUUID } from 'node:crypto';
import type { RegisterDeviceResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { generateToken, hashToken } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { enforceClientRateLimit } from '@/lib/api/client-limit';
import { CLIENT_RATE_LIMITS, enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { readJson, registerDeviceSchema } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/devices { displayName } → 201 { deviceId, token, displayName }.
 * The token is returned only here, once; the database keeps only its SHA-256 hash.
 * Limits: 30 per client address per hour (in memory only; addresses are never stored) and a
 * global backstop of 1000 per hour (database).
 */
export const POST = apiRoute('/api/devices', METHODS, async (req) => {
  const { displayName } = await readJson(req, registerDeviceSchema);
  const now = Date.now();
  enforceClientRateLimit(req, CLIENT_RATE_LIMITS.registerDevice, now);
  const db = await getDb();
  await enforceRateLimit(db, RATE_LIMITS.registerDevice, 'global', now);

  const deviceId = randomUUID();
  const token = generateToken();
  await db.createDevice({ id: deviceId, displayName, tokenHash: hashToken(token), createdAt: now });

  const body: RegisterDeviceResponse = { deviceId, token, displayName };
  return Response.json(body, { status: 201 });
});

export const OPTIONS = preflight(METHODS);
