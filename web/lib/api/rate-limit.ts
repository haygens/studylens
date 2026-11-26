import type { Db } from '@/lib/db';
import { ApiError } from './errors';

export interface RateLimitRule {
  /** Prefix of the counter key. */
  name: string;
  limit: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;

/**
 * Limits counted in the database (fixed windows), so they hold across serverless instances.
 * Keys are a device ID or a global name — never an IP address.
 */
export const RATE_LIMITS = {
  /**
   * Backstop for all new registrations together. The real per-client limit is
   * `CLIENT_RATE_LIMITS.registerDevice` (in memory); this only stops a distributed flood from
   * filling the table.
   */
  registerDevice: { name: 'register', limit: 1000, windowMs: HOUR },
  /** Error reports per device. */
  errorReport: { name: 'errors', limit: 20, windowMs: HOUR },
  /** Join attempts per device, successful or not (stops guessing codes). */
  joinGroup: { name: 'join', limit: 20, windowMs: HOUR },
  /** New groups per device. */
  createGroup: { name: 'create-group', limit: 10, windowMs: HOUR },
  /** Display name changes per device. */
  renameDevice: { name: 'rename', limit: 20, windowMs: HOUR },
  /**
   * P18. The extension sends totals at most every 5 minutes during a session plus once at its
   * end (≈ 13/hour), a presence heartbeat once a minute while a session runs (≈ 62/hour), and the
   * Study groups page refreshes every 60 s per group (up to 5 groups → 300/hour). The limits
   * leave room for that and stop anything faster.
   */
  sendTotals: { name: 'totals', limit: 60, windowMs: HOUR },
  sendPresence: { name: 'presence', limit: 150, windowMs: HOUR },
  updateSharing: { name: 'sharing', limit: 60, windowMs: HOUR },
  groupOverview: { name: 'overview', limit: 600, windowMs: HOUR },
  focusingNow: { name: 'focusing', limit: 240, windowMs: HOUR },
  /**
   * P18b live group sessions. The extension sends a heartbeat on the session's 1-minute tick
   * (≈ 60/hour) and polls every 15 s only while the popup or the Study groups tab is open
   * (≈ 240/hour each, list and state together stay under the limits below).
   */
  startLive: { name: 'live-start', limit: 20, windowMs: HOUR },
  joinLive: { name: 'live-join', limit: 60, windowMs: HOUR },
  leaveLive: { name: 'live-leave', limit: 60, windowMs: HOUR },
  liveHeartbeat: { name: 'live-heartbeat', limit: 150, windowMs: HOUR },
  listLive: { name: 'live-list', limit: 600, windowMs: HOUR },
  liveState: { name: 'live-state', limit: 900, windowMs: HOUR },
} satisfies Record<string, RateLimitRule>;

/**
 * Limits per client address, counted in memory only (see client-limit.ts). Generous, because a
 * whole class on school Wi-Fi shares one public address.
 */
export const CLIENT_RATE_LIMITS = {
  registerDevice: { name: 'register', limit: 30, windowMs: HOUR },
  joinGroup: { name: 'join', limit: 60, windowMs: HOUR },
  createGroup: { name: 'create-group', limit: 30, windowMs: HOUR },
  /**
   * P18c: public room page lookups (no device token). The page polls every 15 s while visible
   * (240/hour per open page); a few phones on the same school Wi-Fi fit easily. Guessing a
   * 16-character code is hopeless anyway; this only stops scripts hammering the database.
   */
  roomLookup: { name: 'room', limit: 1200, windowMs: HOUR },
} satisfies Record<string, RateLimitRule>;

/** Counts one request for `subject` (a device ID, or `global`); throws 429 when over the limit. */
export async function enforceRateLimit(
  db: Db,
  rule: RateLimitRule,
  subject: string,
  now = Date.now(),
): Promise<void> {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const count = await db.hitRateLimit(`${rule.name}:${subject}`, windowStart);
  if (count > rule.limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));
    throw new ApiError(
      429,
      'rate_limited',
      `Too many requests. Try again in ${retryAfter} seconds.`,
      undefined,
      { 'Retry-After': String(retryAfter) },
    );
  }
}
