import { createHmac, randomBytes } from 'node:crypto';
import { ApiError } from './errors';
import type { RateLimitRule } from './rate-limit';

/**
 * Per-client-address rate limits, kept **in memory only** (privacy: IP addresses are never written
 * to the database, logs or error reports). Even in memory, the address is replaced by an HMAC
 * with a random key made when the server instance starts, so the raw address isn't kept at all.
 *
 * Trade-offs (documented in docs/backend.md):
 * - Each serverless instance has its own counters and they reset when it restarts, so this is a
 *   best-effort brake on scripts, not an exact quota. The per-device limits (in the database)
 *   and the global registration cap are exact.
 * - Students on the same school network share one public address, so the limits are generous.
 */

const KEY = randomBytes(32);
/** Upper bound on remembered addresses per instance; the oldest windows are dropped first. */
const MAX_ENTRIES = 50_000;
let maxEntries = MAX_ENTRIES;
/** Expired counters are dropped at most this often, so an address is forgotten within ~70 min. */
const PRUNE_EVERY_MS = 10 * 60 * 1000;
let lastPrune = 0;

interface Entry {
  windowStart: number;
  count: number;
}

const counters = new Map<string, Entry>();
/** Longest window any client rule uses; older entries are dropped when pruning. */
const HOUR_MAX = 60 * 60 * 1000;

/**
 * The client's address as Vercel reports it. Vercel sets `x-forwarded-for` itself (it overwrites
 * whatever the client sent), so its first entry is the real client. Locally there is no proxy:
 * every request counts as the same client, `local`.
 */
export function clientAddress(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'local';
}

function clientKey(rule: RateLimitRule, req: Request): string {
  const digest = createHmac('sha256', KEY).update(clientAddress(req)).digest('base64url');
  return `${rule.name}:${digest.slice(0, 22)}`;
}

function prune(now: number): void {
  lastPrune = now;
  for (const [k, v] of counters) if (now - v.windowStart >= HOUR_MAX) counters.delete(k);
  // Still too many (a flood of distinct addresses): drop the oldest entries.
  if (counters.size >= maxEntries) {
    const oldest = [...counters].sort((a, b) => a[1].windowStart - b[1].windowStart);
    for (const [k] of oldest.slice(0, counters.size - maxEntries + 1)) counters.delete(k);
  }
}

/** Counts one request from this client address; throws 429 when over the limit. */
export function enforceClientRateLimit(req: Request, rule: RateLimitRule, now = Date.now()): void {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const key = clientKey(rule, req);
  let entry = counters.get(key);
  if (!entry || entry.windowStart !== windowStart) {
    if (counters.size >= maxEntries || now - lastPrune >= PRUNE_EVERY_MS) prune(now);
    entry = { windowStart, count: 0 };
    counters.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > rule.limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));
    throw new ApiError(
      429,
      'rate_limited',
      `Too many requests from your network. Try again in ${retryAfter} seconds.`,
      undefined,
      { 'Retry-After': String(retryAfter) },
    );
  }
}

/** Tests only: forget every counter. */
export function resetClientRateLimits(): void {
  counters.clear();
  lastPrune = 0;
}

/** Tests only: change the cap on remembered addresses (`undefined` restores the default). */
export function setClientRateLimitCapForTests(cap: number | undefined): void {
  maxEntries = cap ?? MAX_ENTRIES;
}

/** Tests only: how many addresses are remembered (to check nothing grows without bound). */
export function clientRateLimitEntries(): number {
  return counters.size;
}
