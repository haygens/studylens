import { isRoomCode, type LiveRoomResponse } from '@studylens/shared';
import { getDb } from '@/lib/db';
import { enforceClientRateLimit } from '@/lib/api/client-limit';
import { ApiError } from '@/lib/api/errors';
import { apiRoute, preflight } from '@/lib/api/handler';
import { CLIENT_RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const METHODS = ['GET'];

/** Unknown, expired and malformed codes all get the same answer (nothing to probe). */
const noRoom = () => new ApiError(404, 'not_found', 'This room link has expired or doesn’t exist.');

/**
 * GET /api/rooms/<code> → 200 { serverNow, room } (P18c). The read-only live room behind
 * `/s/<code>`: group name, optional goal, shared timer, and each participant's display name and
 * status. No device token needed (the long random code is the key), so: no device IDs, no
 * minutes, no "me". Valid until 1 hour after the session ended. Rate-limited per client address,
 * counted in memory only (never stored). `X-Robots-Tag: noindex`.
 */
export const GET = apiRoute('/api/rooms/[code]', METHODS, async (req) => {
  const now = Date.now();
  enforceClientRateLimit(req, CLIENT_RATE_LIMITS.roomLookup, now);
  const code = /^\/api\/rooms\/([^/]+)\/?$/.exec(new URL(req.url).pathname)?.[1] ?? '';
  if (!isRoomCode(code)) throw noRoom();
  const room = await (await getDb()).liveRoom(code, now);
  if (!room) throw noRoom();
  const body: LiveRoomResponse = { serverNow: Date.now(), room };
  return Response.json(body, { headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
});

export const OPTIONS = preflight(METHODS);
