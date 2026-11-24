import { beforeEach, describe, expect, it } from 'vitest';
import {
  clientAddress,
  clientRateLimitEntries,
  enforceClientRateLimit,
  resetClientRateLimits,
  setClientRateLimitCapForTests,
} from './client-limit';
import { ApiError } from './errors';

const RULE = { name: 'test', limit: 3, windowMs: 60_000 };
const T = 1_800_000_000_000;
const req = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/x', { headers });

describe('client address rate limit (memory only)', () => {
  beforeEach(() => resetClientRateLimits());

  it('uses the first x-forwarded-for entry, then x-real-ip, else "local"', () => {
    expect(clientAddress(req({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5');
    expect(clientAddress(req({ 'x-real-ip': '203.0.113.6' }))).toBe('203.0.113.6');
    expect(clientAddress(req())).toBe('local');
  });

  it('allows `limit` requests per address and window, then 429 with Retry-After', () => {
    const a = req({ 'x-forwarded-for': '203.0.113.5' });
    for (let i = 0; i < RULE.limit; i++) enforceClientRateLimit(a, RULE, T);
    let error: unknown;
    try {
      enforceClientRateLimit(a, RULE, T + 15_000);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).headers?.['Retry-After']).toBe('45');
    // Another address, another rule name, or the next window: allowed.
    enforceClientRateLimit(req({ 'x-forwarded-for': '203.0.113.9' }), RULE, T);
    enforceClientRateLimit(a, { ...RULE, name: 'other' }, T);
    enforceClientRateLimit(a, RULE, T + RULE.windowMs);
  });

  it('forgets an address about an hour after its window, even when the map is not full', () => {
    enforceClientRateLimit(req({ 'x-forwarded-for': '203.0.113.5' }), RULE, T);
    expect(clientRateLimitEntries()).toBe(1);
    // 70 minutes later, any new request prunes the expired entry.
    enforceClientRateLimit(req({ 'x-forwarded-for': '203.0.113.6' }), RULE, T + 70 * 60_000);
    expect(clientRateLimitEntries()).toBe(1);
  });

  it('drops windows older than an hour, and never grows past the cap', () => {
    setClientRateLimitCapForTests(10);
    try {
      for (let i = 0; i < 10; i++) {
        enforceClientRateLimit(req({ 'x-forwarded-for': `10.0.0.${i}` }), RULE, T);
      }
      expect(clientRateLimitEntries()).toBe(10);
      // Full map, two hours later: the stale entries are dropped first.
      enforceClientRateLimit(req({ 'x-forwarded-for': '10.0.1.1' }), RULE, T + 2 * 3_600_000);
      expect(clientRateLimitEntries()).toBe(1);
      // A flood of new addresses in one window: the oldest are evicted, the size stays capped.
      for (let i = 0; i < 50; i++) {
        enforceClientRateLimit(req({ 'x-forwarded-for': `10.0.2.${i}` }), RULE, T + 2 * 3_600_000);
      }
      expect(clientRateLimitEntries()).toBeLessThanOrEqual(10);
    } finally {
      setClientRateLimitCapForTests(undefined);
    }
  });
});
