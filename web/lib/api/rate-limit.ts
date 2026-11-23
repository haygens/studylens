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
 * Limits are counted in the database (fixed windows), so they hold across serverless instances.
 * Keys are a device ID or a global name — never an IP address.
 */
export const RATE_LIMITS = {
  /**
   * Registration has no device yet, and we don't store IPs, so this is one global cap for all
   * new registrations. Plenty for a class; stops a script from filling the table.
   */
  registerDevice: { name: 'register', limit: 100, windowMs: HOUR },
  /** Error reports per device. */
  errorReport: { name: 'errors', limit: 20, windowMs: HOUR },
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
