import { getDb } from '@/lib/db';
import { requireDevice } from '@/lib/api/auth';
import { groupIdFromPath, notMember } from '@/lib/api/group-errors';
import { apiRoute, preflight } from '@/lib/api/handler';
import {
  liveBusy,
  liveLength,
  liveResponse,
  liveSessionRunning,
  startLiveSchema,
} from '@/lib/api/live';
import { generateRoomCode } from '@/lib/api/join-code';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/api/rate-limit';
import { readJson } from '@/lib/api/validation';

export const dynamic = 'force-dynamic';

const METHODS = ['POST'];

/**
 * POST /api/groups/<id>/sessions { goal?, minutes } → 201 { serverNow, session } (P18b).
 *
 * Starts a live group focus session: an optional goal the group sees (≤120 characters) and a
 * length of 5–180 minutes. The server's clock sets the shared end time. I join it as the host.
 * 409 `session_running` if the group already has one running (or I'm in another one); 404 if
 * I'm not in the group.
 */
export const POST = apiRoute('/api/groups/[id]/sessions', METHODS, async (req) => {
  const db = await getDb();
  const now = Date.now();
  const device = await requireDevice(req, db, now);
  const groupId = groupIdFromPath(new URL(req.url).pathname, 'sessions');
  if (!groupId) throw notMember();
  await enforceRateLimit(db, RATE_LIMITS.startLive, device.id, now);
  const body = await readJson(req, startLiveSchema());
  const id = crypto.randomUUID();
  const start = () =>
    db.startLiveSession({
      id,
      groupId,
      hostDeviceId: device.id,
      goal: body.goal || null,
      startedAt: now,
      ...liveLength(body, now),
      roomCode: generateRoomCode(),
    });
  // P18c: a room code that is already taken (practically impossible) gets one retry.
  const result = await start().catch((err: unknown) => {
    if (String(err).includes('UNIQUE')) return start();
    throw err;
  });
  if (result.status === 'not_member') throw notMember();
  if (result.status === 'session_running') throw liveSessionRunning();
  if (result.status === 'busy') throw liveBusy();
  const session = await db.liveSession(id, device.id, now);
  if (!session) throw notMember(); // Left the group in the same moment.
  return liveResponse(session, 201);
});

export const OPTIONS = preflight(METHODS);
