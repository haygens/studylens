/**
 * Behaviour every `Db` implementation must share. Run by memory.test.ts and sql-db.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PRESENCE_TTL_MS,
  SHARING_DEFAULT,
  SHARING_OFF,
  type GroupSharing,
} from '@studylens/shared';
import { ERROR_LOG_MAX_AGE_MS, GOAL_AFTER_END_MS, RATE_LIMIT_ROW_MAX_AGE_MS } from './retention';
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
      const group = (
        id: string,
        code: string,
        owner: string,
        at = NOW,
        sharing: GroupSharing = SHARING_OFF,
      ) =>
        db.createGroup(
          { id, name: `Group ${id}`, joinCode: code, deviceId: owner, createdAt: at, sharing },
          LIMITS.maxGroupsPerDevice,
        );

      it('creates a group with the creator as owner and lists it with members', async () => {
        await device('d1', 'Sam');
        await device('d2', 'Alex');
        expect(await group('g1', 'ABCDEFGH', 'd1')).toEqual({ status: 'created' });
        expect(await db.joinGroup('ABCDEFGH', 'd2', NOW + 1, LIMITS, SHARING_OFF)).toEqual({
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
            sharing: SHARING_OFF,
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
        expect(await db.joinGroup('ZZZZZZZZ', 'd2', NOW, LIMITS, SHARING_OFF)).toEqual({
          status: 'not_found',
        });
        expect(await db.joinGroup('AAAAAAAA', 'd1', NOW, LIMITS, SHARING_OFF)).toEqual({
          status: 'already_member',
          groupId: 'g1',
        });
        await db.joinGroup('AAAAAAAA', 'd2', NOW, LIMITS, SHARING_OFF);
        await db.joinGroup('AAAAAAAA', 'd3', NOW, LIMITS, SHARING_OFF);
        expect(await db.joinGroup('AAAAAAAA', 'd4', NOW, LIMITS, SHARING_OFF)).toEqual({
          status: 'group_full',
        });
        // A member of a full group asking again is still "already a member".
        expect((await db.joinGroup('AAAAAAAA', 'd3', NOW, LIMITS, SHARING_OFF)).status).toBe(
          'already_member',
        );
        await group('g2', 'BBBBBBBB', 'd4');
        await group('g3', 'CCCCCCCC', 'd4');
        await group('g5', 'DDDDDDDD', 'd2');
        expect(await db.joinGroup('DDDDDDDD', 'd4', NOW, LIMITS, SHARING_OFF)).toEqual({
          status: 'too_many_groups',
        });
      });

      it('leaving: the oldest member becomes owner; the last one out deletes the group', async () => {
        for (const d of ['d1', 'd2', 'd3']) await device(d);
        await group('g1', 'AAAAAAAA', 'd1');
        await db.joinGroup('AAAAAAAA', 'd2', NOW + 1, LIMITS, SHARING_OFF);
        await db.joinGroup('AAAAAAAA', 'd3', NOW + 2, LIMITS, SHARING_OFF);
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
        expect((await db.joinGroup('AAAAAAAA', 'd1', NOW, LIMITS, SHARING_OFF)).status).toBe(
          'not_found',
        );
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
        await db.joinGroup('AAAAAAAA', 'd2', NOW + 1, LIMITS, SHARING_OFF);
        await db.deleteDevice('d1');

        expect(await db.findDeviceByTokenHash('d1'.padEnd(64, '0'))).toBeNull();
        expect(await db.listGroups('d1')).toEqual([]);
        const [g1] = await db.listGroups('d2');
        expect(g1?.members).toEqual([{ displayName: 'name-d2', role: 'owner', isMe: true }]);
        expect((await db.joinGroup('BBBBBBBB', 'd2', NOW, LIMITS, SHARING_OFF)).status).toBe(
          'not_found',
        );
        // Deleting a device that doesn't exist is fine.
        await expect(db.deleteDevice('d1')).resolves.toBeUndefined();
      });

      describe('passive groups (P18)', () => {
        const TODAY = '2026-11-22';
        const Q = { now: NOW, today: TODAY, historyDays: 7 };
        const ONLY_MINUTES = { focusMinutes: true, focusingNow: false };
        const ONLY_PRESENCE = { focusMinutes: false, focusingNow: true };

        /** d1 (owner, sharing given) and d2 (member, sharing given) in g1. */
        async function pair(s1: GroupSharing, s2: GroupSharing) {
          await device('d1', 'Sam');
          await device('d2', 'Alex');
          await group('g1', 'AAAAAAAA', 'd1', NOW, s1);
          await db.joinGroup('AAAAAAAA', 'd2', NOW + 1, LIMITS, s2);
        }
        const overviewOf = async (viewer: string, groupId = 'g1', q = Q) =>
          (await db.groupOverview(groupId, viewer, q))?.members;

        it('stores the switches given on create and join, and lists them', async () => {
          await pair(SHARING_DEFAULT, ONLY_MINUTES);
          expect((await db.listGroups('d1'))[0]?.sharing).toEqual(SHARING_DEFAULT);
          expect((await db.listGroups('d2'))[0]?.sharing).toEqual(ONLY_MINUTES);
          // Joining again keeps the switches the member already has.
          await db.joinGroup('AAAAAAAA', 'd2', NOW + 2, LIMITS, SHARING_OFF);
          expect((await db.listGroups('d2'))[0]?.sharing).toEqual(ONLY_MINUTES);
        });

        it('overview: minutes, history and focusing now, only what each member shares', async () => {
          await pair(SHARING_DEFAULT, SHARING_OFF);
          await db.updateSharing('g1', 'd2', ONLY_PRESENCE);
          expect(
            await db.upsertDailyTotals(
              'd1',
              [
                { localDate: TODAY, focusMinutes: 50 },
                { localDate: '2026-11-20', focusMinutes: 25 },
              ],
              NOW,
            ),
          ).toBe(2);
          // d2 shares no minutes: nothing is stored.
          expect(
            await db.upsertDailyTotals('d2', [{ localDate: TODAY, focusMinutes: 30 }], NOW),
          ).toBe(0);
          expect(await db.setPresence('d1', 'start', NOW - 60_000, PRESENCE_TTL_MS)).toBe(true);
          expect(await db.setPresence('d2', 'start', NOW - 60_000, PRESENCE_TTL_MS)).toBe(true);

          const view = await db.groupOverview('g1', 'd2', Q);
          expect(view?.group).toEqual({ id: 'g1', name: 'Group g1' });
          expect(view?.members).toEqual([
            {
              displayName: 'Sam',
              role: 'owner',
              isMe: false,
              todayMinutes: 50,
              focusingNow: true,
              history: [
                { localDate: '2026-11-16', focusMinutes: 0 },
                { localDate: '2026-11-17', focusMinutes: 0 },
                { localDate: '2026-11-18', focusMinutes: 0 },
                { localDate: '2026-11-19', focusMinutes: 0 },
                { localDate: '2026-11-20', focusMinutes: 25 },
                { localDate: '2026-11-21', focusMinutes: 0 },
                { localDate: TODAY, focusMinutes: 50 },
              ],
            },
            {
              displayName: 'Alex',
              role: 'member',
              isMe: true,
              todayMinutes: null,
              focusingNow: true,
              history: null,
            },
          ]);
          // Not a member: no overview at all.
          await device('d3');
          expect(await db.groupOverview('g1', 'd3', Q)).toBeNull();
          expect(await db.groupOverview('nope', 'd1', Q)).toBeNull();
        });

        it('upserts a day (replaces, not adds) and ignores days outside the history', async () => {
          await pair(SHARING_DEFAULT, SHARING_OFF);
          await db.upsertDailyTotals('d1', [{ localDate: TODAY, focusMinutes: 10 }], NOW);
          await db.upsertDailyTotals('d1', [{ localDate: TODAY, focusMinutes: 35 }], NOW + 1);
          await db.upsertDailyTotals('d1', [{ localDate: '2026-11-10', focusMinutes: 99 }], NOW);
          const [sam] = (await overviewOf('d2')) ?? [];
          expect(sam?.todayMinutes).toBe(35);
          expect(sam?.history?.reduce((n, d) => n + d.focusMinutes, 0)).toBe(35);
          // "Today" is the viewer's date: a viewer already on the next day sees 0 today.
          const [next] = (await overviewOf('d2', 'g1', { ...Q, today: '2026-11-23' })) ?? [];
          expect(next?.todayMinutes).toBe(0);
          expect(next?.history?.at(-2)).toEqual({ localDate: TODAY, focusMinutes: 35 });
        });

        it('focusing now expires after the TTL and ends with stop', async () => {
          await pair(SHARING_DEFAULT, SHARING_DEFAULT);
          await db.setPresence('d1', 'start', NOW, PRESENCE_TTL_MS);
          expect((await overviewOf('d2'))?.[0]?.focusingNow).toBe(true);
          expect(await db.countFocusingNow('d2', NOW)).toBe(1);
          // Heartbeats keep it alive.
          await db.setPresence('d1', 'heartbeat', NOW + 120_000, PRESENCE_TTL_MS);
          const later = { ...Q, now: NOW + PRESENCE_TTL_MS + 60_000 };
          expect((await overviewOf('d2', 'g1', later))?.[0]?.focusingNow).toBe(true);
          // No heartbeat for 3 minutes: not focusing any more.
          const stale = { ...Q, now: NOW + 120_000 + PRESENCE_TTL_MS };
          expect((await overviewOf('d2', 'g1', stale))?.[0]?.focusingNow).toBe(false);
          expect(await db.countFocusingNow('d2', stale.now)).toBe(0);
          // A stop ends it at once.
          await db.setPresence('d1', 'start', NOW, PRESENCE_TTL_MS);
          expect(await db.setPresence('d1', 'stop', NOW + 1, PRESENCE_TTL_MS)).toBe(false);
          expect((await overviewOf('d2'))?.[0]?.focusingNow).toBe(false);
        });

        it('turning a switch off hides the data and deletes it when no group shares it', async () => {
          await pair(SHARING_DEFAULT, SHARING_DEFAULT);
          await device('d3', 'Kim');
          await group('g2', 'BBBBBBBB', 'd1', NOW, SHARING_DEFAULT);
          await db.joinGroup('BBBBBBBB', 'd3', NOW, LIMITS, SHARING_OFF);
          await db.upsertDailyTotals('d1', [{ localDate: TODAY, focusMinutes: 40 }], NOW);
          await db.setPresence('d1', 'start', NOW, PRESENCE_TTL_MS);

          // Off in g1 only: hidden in g1, still visible in g2.
          expect(await db.updateSharing('g1', 'd1', { focusMinutes: false })).toEqual(
            ONLY_PRESENCE,
          );
          expect((await overviewOf('d2'))?.[0]).toMatchObject({
            todayMinutes: null,
            history: null,
            focusingNow: true,
          });
          expect((await overviewOf('d3', 'g2'))?.[0]?.todayMinutes).toBe(40);

          // Off in g2 too: the totals are deleted on the server. Turning it back on shows
          // nothing until the extension sends again.
          await db.updateSharing('g2', 'd1', { focusMinutes: false, focusingNow: false });
          await db.updateSharing('g2', 'd1', { focusMinutes: true });
          expect((await overviewOf('d3', 'g2'))?.[0]?.todayMinutes).toBe(0);
          // Presence is still shared in g1; off there too deletes it.
          await db.updateSharing('g1', 'd1', { focusingNow: false });
          await db.updateSharing('g1', 'd1', { focusingNow: true });
          expect((await overviewOf('d2'))?.[0]?.focusingNow).toBe(false);

          expect(await db.updateSharing('g1', 'd3', { focusMinutes: true })).toBeNull();
        });

        it('leaving a group removes my data from it at once', async () => {
          await pair(SHARING_DEFAULT, SHARING_DEFAULT);
          await db.upsertDailyTotals('d2', [{ localDate: TODAY, focusMinutes: 15 }], NOW);
          await db.setPresence('d2', 'start', NOW, PRESENCE_TTL_MS);
          await db.leaveGroup('g1', 'd2');
          expect((await overviewOf('d1'))?.map((m) => m.displayName)).toEqual(['Sam']);
          expect(await db.countFocusingNow('d1', NOW)).toBe(0);
          // Re-joining (sharing on) shows nothing old: the data was deleted, not just hidden.
          await db.joinGroup('AAAAAAAA', 'd2', NOW + 5, LIMITS, SHARING_DEFAULT);
          expect((await overviewOf('d1'))?.[1]).toMatchObject({
            todayMinutes: 0,
            focusingNow: false,
          });
        });

        it('deleting the device removes its totals and presence', async () => {
          await pair(SHARING_DEFAULT, SHARING_DEFAULT);
          await db.upsertDailyTotals('d2', [{ localDate: TODAY, focusMinutes: 15 }], NOW);
          await db.setPresence('d2', 'start', NOW, PRESENCE_TTL_MS);
          await db.deleteDevice('d2');
          expect(await db.countFocusingNow('d1', NOW)).toBe(0);
          await device('d2', 'Alex');
          await db.joinGroup('AAAAAAAA', 'd2', NOW + 5, LIMITS, SHARING_DEFAULT);
          expect((await overviewOf('d1'))?.[1]?.todayMinutes).toBe(0);
        });

        it('countFocusingNow counts other members once across groups, never me', async () => {
          await pair(SHARING_DEFAULT, SHARING_DEFAULT);
          await device('d3', 'Kim');
          await group('g2', 'BBBBBBBB', 'd2', NOW, SHARING_DEFAULT);
          await db.joinGroup('BBBBBBBB', 'd1', NOW, LIMITS, SHARING_DEFAULT);
          await db.joinGroup('BBBBBBBB', 'd3', NOW, LIMITS, ONLY_MINUTES);
          for (const d of ['d1', 'd2', 'd3']) {
            await db.setPresence(d, 'start', NOW, PRESENCE_TTL_MS);
          }
          // d2 is in both of d1's groups but counts once; d3 doesn't share presence.
          expect(await db.countFocusingNow('d1', NOW)).toBe(1);
          expect(await db.countFocusingNow('d2', NOW)).toBe(1);
          // d3 doesn't share presence with anyone, so it can't count as focusing.
          expect(await db.setPresence('d3', 'heartbeat', NOW, PRESENCE_TTL_MS)).toBe(false);
          expect(await db.countFocusingNow('d3', NOW)).toBe(2);
        });

        it('cleanup deletes totals older than 14 days and expired presence', async () => {
          await pair(SHARING_DEFAULT, SHARING_DEFAULT);
          await db.upsertDailyTotals(
            'd1',
            [
              { localDate: '2026-11-07', focusMinutes: 5 }, // 15 days before NOW's date
              { localDate: '2026-11-08', focusMinutes: 6 }, // 14 days: kept
            ],
            NOW,
          );
          await db.setPresence('d1', 'start', NOW - PRESENCE_TTL_MS - 1, PRESENCE_TTL_MS);
          await db.setPresence('d2', 'start', NOW, PRESENCE_TTL_MS);
          const result = await db.cleanup(NOW);
          expect(result.dailyTotalsDeleted).toBe(1);
          expect(result.presenceRowsDeleted).toBe(1);
          const view = await db.groupOverview('g1', 'd2', {
            now: NOW,
            today: '2026-11-08',
            historyDays: 2,
          });
          expect(view?.members[0]?.history).toEqual([
            { localDate: '2026-11-07', focusMinutes: 0 },
            { localDate: '2026-11-08', focusMinutes: 6 },
          ]);
          expect(view?.members[1]?.focusingNow).toBe(true);
        });
      });

      describe('live group sessions (P18b)', () => {
        const MIN = 60_000;
        const ONLY_MINUTES = { focusMinutes: true, focusingNow: false };
        /** Sam (d1, owner, shares minutes) and Alex (d2, shares nothing) in g1. */
        async function pair() {
          await device('d1', 'Sam');
          await device('d2', 'Alex');
          await group('g1', 'AAAAAAAA', 'd1', NOW, ONLY_MINUTES);
          await db.joinGroup('AAAAAAAA', 'd2', NOW + 1, LIMITS, SHARING_OFF);
        }
        const start = (id = 's1', host = 'd1', at = NOW, minutes = 25, groupId = 'g1') =>
          db.startLiveSession({
            id,
            groupId,
            hostDeviceId: host,
            goal: 'Chapter 4',
            plannedMinutes: minutes,
            startedAt: at,
            endsAt: at + minutes * MIN,
            roomCode: `ROOM${id.toUpperCase()}`.padEnd(16, 'Z'),
          });

        it('starts a session: the host is in it; members see it, others do not', async () => {
          await pair();
          await device('d3', 'Kim');
          expect(await start()).toEqual({ status: 'started' });
          const seen = await db.listLiveSessions('d2', NOW + MIN);
          expect(seen).toEqual([
            {
              id: 's1',
              groupId: 'g1',
              groupName: 'Group g1',
              goal: 'Chapter 4',
              plannedMinutes: 25,
              startedAt: NOW,
              endsAt: NOW + 25 * MIN,
              state: 'running',
              me: null,
              participants: [
                {
                  displayName: 'Sam',
                  isMe: false,
                  isHost: true,
                  status: 'focusing',
                  recentlySeen: true,
                  lastSeenMinutesAgo: null,
                  focusMinutes: null,
                },
              ],
              roomCode: 'ROOMS1'.padEnd(16, 'Z'),
            },
          ]);
          expect((await db.listLiveSessions('d1', NOW + MIN))[0]?.me).toBe('focusing');
          expect(await db.listLiveSessions('d3', NOW + MIN)).toEqual([]);
          expect(await db.liveSession('s1', 'd3', NOW)).toBeNull();
          expect(await db.liveSession('nope', 'd1', NOW)).toBeNull();
          // Not a member: can't start one.
          expect(await start('s9', 'd3')).toEqual({ status: 'not_member' });
        });

        it('one running session per group; a new one once it is over', async () => {
          await pair();
          await start();
          expect(await start('s2', 'd2', NOW + MIN)).toEqual({ status: 'session_running' });
          // After the shared end time, a new one can start.
          expect(await start('s2', 'd2', NOW + 25 * MIN)).toEqual({ status: 'started' });
          expect((await db.listLiveSessions('d1', NOW + 26 * MIN)).map((s) => s.id)).toEqual([
            's2',
          ]);
        });

        it('one live session at a time per device, across groups', async () => {
          await pair();
          await group('g2', 'BBBBBBBB', 'd2', NOW);
          await db.joinGroup('BBBBBBBB', 'd1', NOW, LIMITS, SHARING_OFF);
          await start();
          expect(await start('s2', 'd1', NOW + MIN, 25, 'g2')).toEqual({ status: 'busy' });
          expect(await start('s2', 'd2', NOW + MIN, 25, 'g2')).toEqual({ status: 'started' });
          expect(await db.joinLiveSession('s2', 'd1', NOW + 2 * MIN)).toBe(false);
          await db.leaveLiveSession('s1', 'd1', NOW + 3 * MIN);
          expect(await db.joinLiveSession('s2', 'd1', NOW + 4 * MIN)).toBe(true);
        });

        it('joining late shares the same end; joining twice is a heartbeat', async () => {
          await pair();
          await start();
          expect(await db.joinLiveSession('s1', 'd2', NOW + 10 * MIN)).toBe(true);
          expect(await db.joinLiveSession('s1', 'd2', NOW + 11 * MIN)).toBe(false);
          const s = await db.liveSession('s1', 'd2', NOW + 12 * MIN);
          expect(s?.endsAt).toBe(NOW + 25 * MIN);
          expect(s?.me).toBe('focusing');
          expect(s?.participants.map((p) => [p.displayName, p.isMe])).toEqual([
            ['Sam', false],
            ['Alex', true],
          ]);
          // Too late: the session is over.
          await device('d3', 'Kim');
          await db.joinGroup('AAAAAAAA', 'd3', NOW, LIMITS, SHARING_OFF);
          expect(await db.joinLiveSession('s1', 'd3', NOW + 25 * MIN)).toBe(false);
          expect((await db.liveSession('s1', 'd3', NOW + 25 * MIN))?.me).toBeNull();
        });

        it('heartbeats keep a participant "recently seen"', async () => {
          await pair();
          await start();
          await db.joinLiveSession('s1', 'd2', NOW);
          const alex = async (at: number) =>
            (await db.liveSession('s1', 'd1', at))?.participants.find(
              (p) => p.displayName === 'Alex',
            );
          expect(await alex(NOW + 2 * MIN - 1)).toMatchObject({
            recentlySeen: true,
            lastSeenMinutesAgo: null,
          });
          expect(await alex(NOW + 2 * MIN)).toMatchObject({
            recentlySeen: false,
            lastSeenMinutesAgo: 2,
          });
          expect((await alex(NOW + 4 * MIN + 59_000))?.lastSeenMinutesAgo).toBe(4);
          expect(await db.heartbeatLiveSession('s1', 'd2', NOW + 5 * MIN)).toBe(true);
          expect(await alex(NOW + 6 * MIN)).toMatchObject({
            recentlySeen: true,
            lastSeenMinutesAgo: null,
          });
          // The public room shows the same "last seen" minutes.
          await db.heartbeatLiveSession('s1', 'd1', NOW + 9 * MIN);
          const room = await db.liveRoom(
            (await db.liveSession('s1', 'd1', NOW))!.roomCode!,
            NOW + 9 * MIN,
          );
          expect(room?.participants.find((p) => p.displayName === 'Alex')).toMatchObject({
            recentlySeen: false,
            lastSeenMinutesAgo: 4,
          });
          // Not in it / after the end: nothing recorded.
          await device('d3');
          expect(await db.heartbeatLiveSession('s1', 'd3', NOW + 5 * MIN)).toBe(false);
          expect(await db.heartbeatLiveSession('s1', 'd2', NOW + 25 * MIN)).toBe(false);
        });

        it('leaving early; the host leaving keeps it running; minutes only if shared', async () => {
          await pair();
          await device('d3', 'Kim');
          await db.joinGroup('AAAAAAAA', 'd3', NOW, LIMITS, ONLY_MINUTES);
          await start();
          await db.joinLiveSession('s1', 'd2', NOW + 5 * MIN);
          await db.joinLiveSession('s1', 'd3', NOW + 5 * MIN);
          // The host leaves after 10 minutes: still running for the others.
          expect(await db.leaveLiveSession('s1', 'd1', NOW + 10 * MIN + 30_000)).toBe(true);
          expect(await db.leaveLiveSession('s1', 'd1', NOW + 11 * MIN)).toBe(false);
          // Leaving is final for that session.
          expect(await db.joinLiveSession('s1', 'd1', NOW + 12 * MIN)).toBe(false);
          let s = await db.liveSession('s1', 'd2', NOW + 12 * MIN);
          expect(s?.state).toBe('running');
          expect(s?.participants.map((p) => [p.displayName, p.status, p.focusMinutes])).toEqual([
            ['Sam', 'left', 10],
            ['Alex', 'focusing', null],
            ['Kim', 'focusing', null],
          ]);
          // At the end: finished, minutes from join to the shared end — Alex shares none.
          s = await db.liveSession('s1', 'd1', NOW + 25 * MIN);
          expect(s?.state).toBe('ended');
          expect(s?.me).toBe('left');
          expect(s?.participants.map((p) => [p.displayName, p.status, p.focusMinutes])).toEqual([
            ['Sam', 'left', 10],
            ['Alex', 'finished', null],
            ['Kim', 'finished', 20],
          ]);
          // Leaving after the end changes nothing.
          expect(await db.leaveLiveSession('s1', 'd2', NOW + 26 * MIN)).toBe(false);
        });

        it('ends early when nobody is focusing any more, so a new one can start', async () => {
          await pair();
          await start();
          await db.joinLiveSession('s1', 'd2', NOW);
          await db.leaveLiveSession('s1', 'd1', NOW + MIN);
          await db.leaveLiveSession('s1', 'd2', NOW + 2 * MIN);
          expect((await db.liveSession('s1', 'd1', NOW + 3 * MIN))?.state).toBe('ended');
          expect(await db.listLiveSessions('d1', NOW + 3 * MIN)).toEqual([]);
          expect(await start('s2', 'd2', NOW + 3 * MIN)).toEqual({ status: 'started' });
        });

        it('leaving the group or deleting the device drops out of its live sessions', async () => {
          await pair();
          await device('d3', 'Kim');
          await db.joinGroup('AAAAAAAA', 'd3', NOW, LIMITS, SHARING_OFF);
          await start();
          await db.joinLiveSession('s1', 'd2', NOW);
          await db.joinLiveSession('s1', 'd3', NOW);
          await db.leaveGroup('g1', 'd2', NOW + MIN);
          await db.deleteDevice('d3', NOW + MIN);
          const s = await db.liveSession('s1', 'd1', NOW + 2 * MIN);
          expect(s?.participants.map((p) => p.displayName)).toEqual(['Sam']);
          expect(s?.state).toBe('running');
          // The host goes too: nobody is focusing, the session ends.
          await db.leaveGroup('g1', 'd1', NOW + 3 * MIN);
          await device('d4', 'Lee');
          await db.joinGroup('AAAAAAAA', 'd4', NOW, LIMITS, SHARING_OFF);
          // (The group was deleted with its last member; d4 can't find it.)
          expect(await db.listLiveSessions('d4', NOW + 4 * MIN)).toEqual([]);
        });

        it('P18c room: names and statuses by room code, nothing else; expires 1 h after the end', async () => {
          await pair();
          await start();
          await db.joinLiveSession('s1', 'd2', NOW + MIN);
          const code = 'ROOMS1'.padEnd(16, 'Z');
          expect((await db.listLiveSessions('d1', NOW))[0]?.roomCode).toBe(code);
          const room = await db.liveRoom(code, NOW + 2 * MIN - 1);
          expect(room).toEqual({
            groupName: 'Group g1',
            goal: 'Chapter 4',
            plannedMinutes: 25,
            startedAt: NOW,
            endsAt: NOW + 25 * MIN,
            state: 'running',
            participants: [
              {
                displayName: 'Sam',
                isHost: true,
                status: 'focusing',
                recentlySeen: true,
                lastSeenMinutesAgo: null,
              },
              {
                displayName: 'Alex',
                isHost: false,
                status: 'focusing',
                recentlySeen: true,
                lastSeenMinutesAgo: null,
              },
            ],
          });
          expect(await db.liveRoom('ZZZZZZZZZZZZZZZZ', NOW)).toBeNull();
          // Still there just before 1 h after the end; gone at 1 h.
          const end = NOW + 25 * MIN;
          expect((await db.liveRoom(code, end + 60 * MIN - 1))?.state).toBe('ended');
          expect(await db.liveRoom(code, end + 60 * MIN)).toBeNull();
          // Everyone left early: the hour counts from then.
          await start('s2', 'd2', end + 61 * MIN);
          await db.leaveLiveSession('s2', 'd2', end + 62 * MIN);
          const code2 = 'ROOMS2'.padEnd(16, 'Z');
          expect(await db.liveRoom(code2, end + 62 * MIN + 59 * MIN)).not.toBeNull();
          expect(await db.liveRoom(code2, end + 62 * MIN + 60 * MIN)).toBeNull();
        });

        it('cleanup ends sessions at their end time and deletes them (and goals) after 24 h', async () => {
          await pair();
          await start();
          await db.joinLiveSession('s1', 'd2', NOW);
          const first = await db.cleanup(NOW + 26 * MIN);
          expect(first.groupSessionsEnded).toBe(1);
          expect(first.groupSessionsDeleted).toBe(0);
          const after = await db.liveSession('s1', 'd1', NOW + 26 * MIN);
          expect(after?.state).toBe('ended');
          expect(after?.participants.map((p) => p.status)).toEqual(['finished', 'finished']);
          expect(after?.goal).toBe('Chapter 4');
          // The API hides the goal 24 h after the end, even before the cleanup runs.
          const end = NOW + 25 * MIN;
          expect((await db.liveSession('s1', 'd1', end + GOAL_AFTER_END_MS + 1))?.goal).toBeNull();
          const later = await db.cleanup(end + GOAL_AFTER_END_MS + 1);
          expect(later.goalsCleared).toBe(1);
          expect(later.groupSessionsDeleted).toBe(1);
          expect(await db.liveSession('s1', 'd1', end + GOAL_AFTER_END_MS + 2)).toBeNull();
        });
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
