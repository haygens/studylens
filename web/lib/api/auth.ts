import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db, Device } from '@/lib/db';
import { ApiError } from './errors';

const TOKEN_PREFIX = 'slt_';
/** 32 random bytes → 43 base64url characters. */
const TOKEN_PATTERN = /^slt_[A-Za-z0-9_-]{43}$/;
/** Don't write `last_seen_at` on every request. */
const TOUCH_INTERVAL_MS = 60_000;

/** A new random device token (256 bits). Shown to the device once; only its hash is stored. */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hex of a token. A plain fast hash is right here: tokens are 256-bit random values, so
 * they can't be guessed or brute-forced the way passwords can.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function unauthorized(message: string): ApiError {
  return new ApiError(401, 'unauthorized', message, undefined, {
    'WWW-Authenticate': 'Bearer realm="studylens"',
  });
}

/** Reads `Authorization: Bearer <token>`, finds the device, and updates its last-seen time. */
export async function requireDevice(req: Request, db: Db, now = Date.now()): Promise<Device> {
  const header = req.headers.get('authorization');
  if (!header) throw unauthorized('Missing Authorization: Bearer <token> header.');
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  if (!token || !TOKEN_PATTERN.test(token)) throw unauthorized('Malformed bearer token.');

  const device = await db.findDeviceByTokenHash(hashToken(token));
  if (!device) throw unauthorized('Unknown or revoked token.');
  if (now - device.lastSeenAt >= TOUCH_INTERVAL_MS) await db.touchDevice(device.id, now);
  return device;
}

/** Constant-time string comparison (for CRON_SECRET). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
