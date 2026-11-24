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

    describe('groups (P16)', () => {
      const LIMITS = { maxMembers: 3, maxGroupsPerDevice: 2 };
      const device = (id: string, name = `name-${id}`) =>
        db.createDevice({
          id,
          displayName: name,
          tokenHash: id.padEnd(64, '0'),
          createdAt: NOW,
        });
      const group = (id: string, code: string, owner: string, at = NOW) =>
        db.createGroup(
          { id, name: `Group ${id}`, joinCode: code, deviceId: owner, createdAt: at },
          LIMITS.maxGroupsPerDevice,
        );

      it('creates a group with the creator as owner and lists it with members', async () => {
        await device('d1', 'Sam');
        await device('d2', 'Alex');
        expect(await group('g1', 'ABCDEFGH', 'd1')).toEqual({ status: 'created' });
        expect(await db.joinGroup('ABCDEFGH', 'd2', NOW + 1, LIMITS)).toEqual({
          status: 'joined',
          groupId: 'g1',
        });
        expect(await db.listGroups('d2')).toEqual([
          {
            id: 'g1',
            name: 'Group g1',
            joinCode: 'ABCDEFGH',
            role: 'member',
            joinedAt: NOW + 1,
            members: [
              { displayName: 'Sam', role: 'owner', isMe: false },
              { displayName: 'Alex', role: 'member', isMe: true },
            ],
          },
        ]);
        expect((await db.listGroups('d1'))[0]?.role).toBe('owner');
        expect(await db.listGroups('nobody')).toEqual([]);
      });

      it('reports a taken join code and the per-device group limit', async () => {
        await device('d1');
        await device('d2');
        await group('g1', 'AAAAAAAA', 'd1');
        expect(await group('g2', 'AAAAAAAA', 'd2')).toEqual({ status: 'code_taken' });
        await group('g3', 'BBBBBBBB', 'd1');
        expect(await group('g4', 'CCCCCCCC', 'd1')).toEqual({ status: 'too_many_groups' });
        expect((await db.listGroups('d1')).map((g) => g.id)).toEqual(['g1', 'g3']);
        expect(await db.listGroups('d2')).toEqual([]);
      });

      it('join: not found, already a member, group full, too many groups', async () => {
        for (const d of ['d1', 'd2', 'd3', 'd4']) await device(d);
        await group('g1', 'AAAAAAAA', 'd1');
        expect(await db.joinGroup('ZZZZZZZZ', 'd2', NOW, LIMITS)).toEqual({
          status: 'not_found',
        });
        expect(await db.joinGroup('AAAAAAAA', 'd1', NOW, LIMITS)).toEqual({
          status: 'already_member',
          groupId: 'g1',
        });
        await db.joinGroup('AAAAAAAA', 'd2', NOW, LIMITS);
        await db.joinGroup('AAAAAAAA', 'd3', NOW, LIMITS);
        expect(await db.joinGroup('AAAAAAAA', 'd4', NOW, LIMITS)).toEqual({
          status: 'group_full',
        });
        // A member of a full group asking again is still "already a member".
        expect((await db.joinGroup('AAAAAAAA', 'd3', NOW, LIMITS)).status).toBe('already_member');
        await group('g2', 'BBBBBBBB', 'd4');
        await group('g3', 'CCCCCCCC', 'd4');
        await group('g5', 'DDDDDDDD', 'd2');
        expect(await db.joinGroup('DDDDDDDD', 'd4', NOW, LIMITS)).toEqual({
          status: 'too_many_groups',
        });
      });

      it('leaving: the oldest member becomes owner; the last one out deletes the group', async () => {
        for (const d of ['d1', 'd2', 'd3']) await device(d);
        await group('g1', 'AAAAAAAA', 'd1');
        await db.joinGroup('AAAAAAAA', 'd2', NOW + 1, LIMITS);
        await db.joinGroup('AAAAAAAA', 'd3', NOW + 2, LIMITS);
        expect(await db.leaveGroup('g1', 'd1')).toBe(true);
        expect(await db.leaveGroup('g1', 'd1')).toBe(false);
        const [g] = await db.listGroups('d3');
        expect(g?.members).toEqual([
          { displayName: 'name-d2', role: 'owner', isMe: false },
          { displayName: 'name-d3', role: 'member', isMe: true },
        ]);
        await db.leaveGroup('g1', 'd2');
        await db.leaveGroup('g1', 'd3');
        // The group is gone: its code no longer works.
        expect((await db.joinGroup('AAAAAAAA', 'd1', NOW, LIMITS)).status).toBe('not_found');
      });

      it('renames a device; members see the new name', async () => {
        await device('d1', 'Sam');
        await group('g1', 'AAAAAAAA', 'd1');
        await db.updateDisplayName('d1', 'Samira');
        expect((await db.findDeviceByTokenHash('d1'.padEnd(64, '0')))?.displayName).toBe('Samira');
        expect((await db.listGroups('d1'))[0]?.members[0]?.displayName).toBe('Samira');
      });

      it('deleteDevice removes the device and its memberships and hands over ownership', async () => {
        for (const d of ['d1', 'd2']) await device(d);
        await group('g1', 'AAAAAAAA', 'd1'); // shared with d2
        await group('g2', 'BBBBBBBB', 'd1'); // only d1
        await db.joinGroup('AAAAAAAA', 'd2', NOW + 1, LIMITS);
        await db.deleteDevice('d1');

        expect(await db.findDeviceByTokenHash('d1'.padEnd(64, '0'))).toBeNull();
        expect(await db.listGroups('d1')).toEqual([]);
        const [g1] = await db.listGroups('d2');
        expect(g1?.members).toEqual([{ displayName: 'name-d2', role: 'owner', isMe: true }]);
        expect((await db.joinGroup('BBBBBBBB', 'd2', NOW, LIMITS)).status).toBe('not_found');
        // Deleting a device that doesn't exist is fine.
        await expect(db.deleteDevice('d1')).resolves.toBeUndefined();
      });
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
