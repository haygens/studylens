/**
 * Behaviour every `Db` implementation must share. Run by memory.test.ts and sql-db.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_LOG_MAX_AGE_MS, RATE_LIMIT_ROW_MAX_AGE_MS } from './retention';
import type { Db } from './types';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const NOW = Date.UTC(2026, 10, 22, 12);

export function describeDbContract(
  name: string,
  open: () => Promise<{ db: Db; dispose(): Promise<void> }>,
): void {
  describe(`Db contract: ${name}`, () => {
    let db: Db;
    let dispose: () => Promise<void>;

    beforeEach(async () => {
      ({ db, dispose } = await open());
    });
    afterEach(async () => {
      await dispose();
    });

    it('pings', async () => {
      await expect(db.ping()).resolves.toBeUndefined();
    });

    it('creates a device and finds it by token hash only', async () => {
      await db.createDevice({ id: 'd1', displayName: 'Sam', tokenHash: HASH_A, createdAt: NOW });
      expect(await db.findDeviceByTokenHash(HASH_A)).toEqual({
        id: 'd1',
        displayName: 'Sam',
        createdAt: NOW,
        lastSeenAt: NOW,
      });
      expect(await db.findDeviceByTokenHash(HASH_B)).toBeNull();
    });

    it('rejects a duplicate token hash or device id', async () => {
      await db.createDevice({ id: 'd1', displayName: 'Sam', tokenHash: HASH_A, createdAt: NOW });
      await expect(
        db.createDevice({ id: 'd2', displayName: 'Alex', tokenHash: HASH_A, createdAt: NOW }),
      ).rejects.toThrow();
      await expect(
        db.createDevice({ id: 'd1', displayName: 'Alex', tokenHash: HASH_B, createdAt: NOW }),
      ).rejects.toThrow();
    });

    it('touchDevice only moves last seen forward', async () => {
      await db.createDevice({ id: 'd1', displayName: 'Sam', tokenHash: HASH_A, createdAt: NOW });
      await db.touchDevice('d1', NOW + 5000);
      expect((await db.findDeviceByTokenHash(HASH_A))?.lastSeenAt).toBe(NOW + 5000);
      await db.touchDevice('d1', NOW + 1000);
      expect((await db.findDeviceByTokenHash(HASH_A))?.lastSeenAt).toBe(NOW + 5000);
    });

    it('stores error logs and lists them newest first', async () => {
      await db.addErrorLog({
        source: 'server',
        route: '/api/devices',
        message: 'first',
        extensionVersion: null,
        createdAt: NOW,
      });
      await db.addErrorLog({
        source: 'extension',
        route: 'popup',
        message: 'second',
        extensionVersion: '0.5.0',
        createdAt: NOW + 1,
      });
      const logs = await db.listErrorLogs();
      expect(logs.map((l) => l.message)).toEqual(['second', 'first']);
      expect(logs[0]).toMatchObject({
        source: 'extension',
        route: 'popup',
        extensionVersion: '0.5.0',
        createdAt: NOW + 1,
      });
      expect(typeof logs[0]!.id).toBe('number');
    });

    it('counts rate-limit hits per key and window', async () => {
      expect(await db.hitRateLimit('errors:d1', 1000)).toBe(1);
      expect(await db.hitRateLimit('errors:d1', 1000)).toBe(2);
      expect(await db.hitRateLimit('errors:d2', 1000)).toBe(1);
      expect(await db.hitRateLimit('errors:d1', 2000)).toBe(1);
    });

    it('cleanup deletes error logs older than 14 days and old rate-limit rows', async () => {
      const old = NOW - ERROR_LOG_MAX_AGE_MS - 1;
      const recent = NOW - ERROR_LOG_MAX_AGE_MS + 60_000;
      for (const [message, createdAt] of [
        ['old', old],
        ['recent', recent],
      ] as const) {
        await db.addErrorLog({
          source: 'server',
          route: null,
          message,
          extensionVersion: null,
          createdAt,
        });
      }
      await db.hitRateLimit('k', NOW - RATE_LIMIT_ROW_MAX_AGE_MS - 1);
      await db.hitRateLimit('k', NOW);

      const result = await db.cleanup(NOW);
      expect(result.errorLogsDeleted).toBe(1);
      expect(result.rateLimitRowsDeleted).toBe(1);
      expect((await db.listErrorLogs()).map((l) => l.message)).toEqual(['recent']);
      expect(await db.hitRateLimit('k', NOW)).toBe(2); // the current window survived
    });
  });
}
