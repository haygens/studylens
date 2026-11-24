import type { DeleteDeviceResponse, UpdateDeviceResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { apiRoute, preflight } from '@/lib/api/handler';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';
import { readJson, updateDeviceSchema } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['PATCH', 'DELETE'];

/** PATCH /api/devices/me { displayName } → 200 { displayName }. Members see the new name. */
export const PATCH = apiRoute('/api/devices/me', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  await enforceRateLimit(db, RATE_LIMITS.renameDevice, device.id, now);
  const { displayName } = await readJson(req, updateDeviceSchema);
  await db.updateDisplayName(device.id, displayName);
  const body: UpdateDeviceResponse = { displayName };
  return Response.json(body);
});

/**
 * DELETE /api/devices/me → 200 { ok: true }: deletes everything the server has about this
 * device (the device and its token hash, memberships, presence, daily totals, live session
 * participation). The token stops working immediately. Rate-limit counters keyed by the device
 * ID expire within a day (daily cleanup); error logs were never linked to the device.
 */
export const DELETE = apiRoute('/api/devices/me', METHODS, async (req) => {
  const db = await getDb();
  const device = await requireDevice(req, db);
  await db.deleteDevice(device.id);
  const body: DeleteDeviceResponse = { ok: true };
  return Response.json(body);
});

export const OPTIONS = preflight(METHODS);
