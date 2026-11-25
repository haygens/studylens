import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SHARING_OFF } from '@studylens/shared';
import { describeDbContract } from './contract';
import { fileUrlToPath, type SqlExecutor } from './executor';
import { currentVersion, runMigrations } from './migrate';
import { GOAL_AFTER_END_MS, PARTICIPANT_STALE_MS } from './retention';
import { MIGRATIONS, TABLES } from './schema';
import { openTestDb, testDrivers, type TestDb } from './test-utils';
import type { Db } from './types';

const NOW = Date.UTC(2026, 10, 22, 12);
const HOUR = 3_600_000;

for (const driver of await testDrivers()) {
  describeDbContract(`libSQL file (${driver})`, () => openTestDb(driver));

  describe(`schema + migrations (${driver})`, () => {
    let t: TestDb;
    let sql: SqlExecutor;
    let db: Db;

    beforeEach(async () => {
      t = await openTestDb(driver);
      ({ sql, db } = t);
    });
    afterEach(async () => {
      await t.dispose();
    });

    const insertDevice = (id: string) =>
      sql.execute({
        sql: `INSERT INTO devices (id, display_name, token_hash, created_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [id, `name-${id}`, id.padEnd(64, '0'), NOW, NOW],
      });

    it('creates every table and records the schema version', async () => {
      const { rows } = await sql.execute({
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      });
      const names = rows.map((r) => r.name);
      for (const table of TABLES) expect(names).toContain(table);
      expect(await currentVersion(sql)).toBe(MIGRATIONS.at(-1)!.version);
    });

    it('is safe to run migrations again (nothing applied twice)', async () => {
      expect(await runMigrations(sql)).toEqual([]);
      const { rows } = await sql.execute({ sql: 'SELECT COUNT(*) AS n FROM schema_migrations' });
      expect(rows[0]!.n).toBe(MIGRATIONS.length);
    });

    it('migration 2 (P18): existing memberships share nothing until the member says so', async () => {
      const old = await openTestDb(driver, { migrate: false });
      try {
        await runMigrations(old.sql, MIGRATIONS.slice(0, 1));
        await old.sql.execute({
          sql: `INSERT INTO devices (id, display_name, token_hash, created_at, last_seen_at)
                VALUES ('d1', 'Sam', ?, ?, ?)`,
          args: ['1'.repeat(64), NOW, NOW],
        });
        await old.sql.execute({
          sql: `INSERT INTO groups (id, name, join_code, created_by, created_at)
                VALUES ('g1', 'G', 'AAAAAAAA', 'd1', ?)`,
          args: [NOW],
        });
        await old.sql.execute({
          sql: `INSERT INTO memberships (group_id, device_id, role, joined_at)
                VALUES ('g1', 'd1', 'owner', ?)`,
          args: [NOW],
        });
        expect(await runMigrations(old.sql, MIGRATIONS.slice(0, 2))).toEqual([2]);
        expect((await old.db.listGroups('d1'))[0]?.sharing).toEqual({
          focusMinutes: false,
          focusingNow: false,
        });
        await expect(
          old.sql.execute({ sql: 'UPDATE memberships SET share_minutes = 2' }),
        ).rejects.toThrow();
      } finally {
        await old.dispose();
      }
    });

    it('migration 3 (P18b): an older live-session row gets its planned end', async () => {
      const old = await openTestDb(driver, { migrate: false });
      try {
        await runMigrations(old.sql, MIGRATIONS.slice(0, 2));
        await old.sql.execute({
          sql: `INSERT INTO groups (id, name, join_code, created_by, created_at)
                VALUES ('g1', 'G', 'AAAAAAAA', NULL, ?)`,
          args: [NOW],
        });
        await old.sql.execute({
          sql: `INSERT INTO group_sessions (id, group_id, planned_minutes, started_at)
                VALUES ('s1', 'g1', 25, ?)`,
          args: [NOW],
        });
        expect(await runMigrations(old.sql)).toEqual([3]);
        const { rows } = await old.sql.execute({ sql: 'SELECT ends_at FROM group_sessions' });
        expect(rows[0]!.ends_at).toBe(NOW + 25 * 60_000);
      } finally {
        await old.dispose();
      }
    });

    it('applies only newer migrations, each once', async () => {
      const extra = {
        version: MIGRATIONS.at(-1)!.version + 1,
        name: 'test-extra',
        statements: ['CREATE TABLE extra_test (id INTEGER PRIMARY KEY)'],
      };
      expect(await runMigrations(sql, [...MIGRATIONS, extra])).toEqual([extra.version]);
      expect(await runMigrations(sql, [...MIGRATIONS, extra])).toEqual([]);
      expect(await currentVersion(sql)).toBe(extra.version);
    });

    it('rolls back a failing migration completely', async () => {
      const broken = {
        version: MIGRATIONS.at(-1)!.version + 1,
        name: 'broken',
        statements: ['CREATE TABLE half_done (id INTEGER)', 'THIS IS NOT SQL'],
      };
      await expect(runMigrations(sql, [...MIGRATIONS, broken])).rejects.toThrow();
      expect(await currentVersion(sql)).toBe(MIGRATIONS.at(-1)!.version);
      const { rows } = await sql.execute({
        sql: "SELECT name FROM sqlite_master WHERE name = 'half_done'",
      });
      expect(rows).toEqual([]);
    });

    it('has no column that could hold browsing data, IPs or emails', async () => {
      // (`host_device_id` is a session's host device, not a web host.)
      const forbidden = /url|host_?name|domain|site|ip_|^ip$|email|title|path|query|user_agent/i;
      for (const table of TABLES) {
        const { rows } = await sql.execute({
          sql: `SELECT name FROM pragma_table_info('${table}')`,
        });
        for (const r of rows) expect(String(r.name), `${table}.${r.name}`).not.toMatch(forbidden);
      }
    });

    it('rejects out-of-range values via CHECK constraints', async () => {
      await insertDevice('d1');
      const bad = [
        ['INSERT INTO daily_totals VALUES (?, ?, ?, ?)', ['d1', '22/11/2026', 10, NOW]],
        ['INSERT INTO daily_totals VALUES (?, ?, ?, ?)', ['d1', '2026-11-22', 1441, NOW]],
        [
          'INSERT INTO devices VALUES (?, ?, ?, ?, ?)',
          ['d2', 'x'.repeat(31), 'b'.repeat(64), NOW, NOW],
        ],
        ['INSERT INTO devices VALUES (?, ?, ?, ?, ?)', ['d3', 'ok', 'short-hash', NOW, NOW]],
      ] as const;
      for (const [s, args] of bad) {
        await expect(sql.execute({ sql: s, args: [...args] }), s).rejects.toThrow();
      }
      await sql.execute({
        sql: 'INSERT INTO groups VALUES (?, ?, ?, ?, ?)',
        args: ['g1', 'G', 'ABC123', 'd1', NOW],
      });
      await sql.execute({
        sql: 'INSERT INTO group_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['s1', 'g1', 'd1', null, 25, NOW, null, NOW + 25 * 60_000],
      });
      await expect(
        sql.execute({
          sql: 'INSERT INTO session_participants VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: ['s1', 'd1', 'browsing', NOW, NOW, null],
        }),
      ).rejects.toThrow();
      await expect(
        sql.execute({
          sql: 'INSERT INTO group_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: ['s2', 'g1', 'd1', null, 0, NOW, null, NOW],
        }),
      ).rejects.toThrow();
    });

    it('accepts a valid daily total and enforces one row per device and date', async () => {
      await insertDevice('d1');
      await sql.execute({
        sql: 'INSERT INTO daily_totals VALUES (?, ?, ?, ?)',
        args: ['d1', '2026-11-22', 135, NOW],
      });
      await expect(
        sql.execute({
          sql: 'INSERT INTO daily_totals VALUES (?, ?, ?, ?)',
          args: ['d1', '2026-11-22', 10, NOW],
        }),
      ).rejects.toThrow();
    });

    it('enforces foreign keys and cascades device deletion', async () => {
      await expect(
        sql.execute({
          sql: 'INSERT INTO daily_totals VALUES (?, ?, ?, ?)',
          args: ['nobody', '2026-11-22', 10, NOW],
        }),
      ).rejects.toThrow();
      await insertDevice('d1');
      await sql.execute({
        sql: 'INSERT INTO groups VALUES (?, ?, ?, ?, ?)',
        args: ['g1', 'G', 'ABC123', 'd1', NOW],
      });
      await sql.execute({
        sql: 'INSERT INTO memberships (group_id, device_id, role, joined_at) VALUES (?, ?, ?, ?)',
        args: ['g1', 'd1', 'owner', NOW],
      });
      await sql.execute({
        sql: 'INSERT INTO daily_totals VALUES (?, ?, ?, ?)',
        args: ['d1', '2026-11-22', 5, NOW],
      });
      await sql.execute({ sql: 'DELETE FROM devices WHERE id = ?', args: ['d1'] });
      const counts = await sql.execute({
        sql: `SELECT (SELECT COUNT(*) FROM memberships) AS m, (SELECT COUNT(*) FROM daily_totals) AS t,
                     (SELECT created_by FROM groups WHERE id = 'g1') AS by`,
      });
      expect(counts.rows[0]).toEqual({ m: 0, t: 0, by: null });
    });

    it('deleteDevice leaves no row anywhere that points to the device', async () => {
      await insertDevice('d1');
      await insertDevice('d2');
      await db.createGroup(
        {
          id: 'g1',
          name: 'G',
          joinCode: 'AAAAAAAA',
          deviceId: 'd1',
          createdAt: NOW,
          sharing: SHARING_OFF,
        },
        5,
      );
      await db.createGroup(
        {
          id: 'g2',
          name: 'Solo',
          joinCode: 'BBBBBBBB',
          deviceId: 'd1',
          createdAt: NOW,
          sharing: SHARING_OFF,
        },
        5,
      );
      await db.joinGroup(
        'AAAAAAAA',
        'd2',
        NOW + 1,
        { maxMembers: 20, maxGroupsPerDevice: 5 },
        SHARING_OFF,
      );
      // P18/P18b rows (no API writes them yet).
      await sql.execute({
        sql: 'INSERT INTO group_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['s1', 'g1', 'd1', 'goal', 25, NOW, null, NOW + 25 * 60_000],
      });
      await sql.execute({
        sql: 'INSERT INTO group_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['s2', 'g2', 'd1', null, 25, NOW, null, NOW + 25 * 60_000],
      });
      await sql.execute({
        sql: 'INSERT INTO session_participants VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['s1', 'd1', 'focusing', NOW, NOW, null],
      });
      await sql.execute({
        sql: 'INSERT INTO device_presence VALUES (?, ?, ?)',
        args: ['d1', NOW, NOW + HOUR],
      });
      await sql.execute({
        sql: 'INSERT INTO daily_totals VALUES (?, ?, ?, ?)',
        args: ['d1', '2026-11-22', 30, NOW],
      });

      // Even with foreign keys off (as a remote database might have them), nothing is left.
      await sql.execute({ sql: 'PRAGMA foreign_keys = OFF' });
      await db.deleteDevice('d1');

      const { rows } = await sql.execute({
        sql: `SELECT
          (SELECT COUNT(*) FROM devices WHERE id = 'd1') AS devices,
          (SELECT COUNT(*) FROM memberships WHERE device_id = 'd1') AS memberships,
          (SELECT COUNT(*) FROM session_participants WHERE device_id = 'd1') AS participants,
          (SELECT COUNT(*) FROM device_presence WHERE device_id = 'd1') AS presence,
          (SELECT COUNT(*) FROM daily_totals WHERE device_id = 'd1') AS totals,
          (SELECT COUNT(*) FROM groups WHERE created_by = 'd1') AS created,
          (SELECT COUNT(*) FROM group_sessions WHERE host_device_id = 'd1') AS hosted,
          (SELECT COUNT(*) FROM groups WHERE id = 'g2') AS emptyGroup,
          (SELECT COUNT(*) FROM group_sessions WHERE id = 's2') AS emptyGroupSession,
          (SELECT role FROM memberships WHERE group_id = 'g1' AND device_id = 'd2') AS d2role`,
      });
      expect(rows[0]).toEqual({
        devices: 0,
        memberships: 0,
        participants: 0,
        presence: 0,
        totals: 0,
        created: 0,
        hosted: 0,
        emptyGroup: 0,
        emptyGroupSession: 0,
        d2role: 'owner',
      });
    });

    it('cleanup clears goals and deletes live sessions 24 h after the end, and stale presence rows', async () => {
      await insertDevice('d1');
      await insertDevice('d2');
      await sql.execute({
        sql: 'INSERT INTO groups VALUES (?, ?, ?, ?, ?)',
        args: ['g1', 'G', 'ABC123', 'd1', NOW],
      });
      const session = (id: string, startedAt: number, endedAt: number | null) =>
        sql.execute({
          sql: 'INSERT INTO group_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [id, 'g1', 'd1', `goal ${id}`, 60, startedAt, endedAt, startedAt + HOUR],
        });
      const dayAgo = NOW - GOAL_AFTER_END_MS;
      await session('ended-old', dayAgo - 2 * HOUR, dayAgo - 1); // ended > 24 h ago → cleared
      await session('ended-recent', dayAgo - HOUR, dayAgo + HOUR); // ended < 24 h ago → kept
      await session('never-ended-old', dayAgo - 2 * HOUR, null); // planned end > 24 h ago → cleared
      await session('running', NOW - 10 * 60_000, null); // → kept

      const participant = (sessionId: string, device: string, heartbeat: number) =>
        sql.execute({
          sql: 'INSERT INTO session_participants VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [sessionId, device, 'focusing', heartbeat, heartbeat, null],
        });
      await participant('ended-old', 'd1', NOW - PARTICIPANT_STALE_MS - 1); // stale → deleted
      await participant('running', 'd2', NOW - 30_000); // live → kept

      await sql.execute({
        sql: 'INSERT INTO device_presence VALUES (?, ?, ?)',
        args: ['d1', NOW - 2 * HOUR, NOW - HOUR],
      });
      await sql.execute({
        sql: 'INSERT INTO device_presence VALUES (?, ?, ?)',
        args: ['d2', NOW - 60_000, NOW + HOUR],
      });

      const result = await db.cleanup(NOW);
      expect(result).toMatchObject({
        goalsCleared: 2,
        presenceRowsDeleted: 1,
        participantRowsDeleted: 1,
        groupSessionsEnded: 1, // never-ended-old: marked ended at its end time…
        groupSessionsDeleted: 2, // …and, like ended-old, deleted (more than 24 h ago)
      });

      const goals = await sql.execute({ sql: 'SELECT id, goal FROM group_sessions ORDER BY id' });
      expect(Object.fromEntries(goals.rows.map((r) => [r.id, r.goal]))).toEqual({
        'ended-recent': 'goal ended-recent',
        running: 'goal running',
      });
      const presence = await sql.execute({ sql: 'SELECT device_id FROM device_presence' });
      expect(presence.rows).toEqual([{ device_id: 'd2' }]);
      const participants = await sql.execute({ sql: 'SELECT device_id FROM session_participants' });
      expect(participants.rows).toEqual([{ device_id: 'd2' }]);
    });
  });
}

describe('fileUrlToPath', () => {
  it('handles relative and absolute file URLs', () => {
    expect(fileUrlToPath('file:.data/dev.db')).toBe('.data/dev.db');
    expect(fileUrlToPath('file:///M:/Projects/studylens/web/.data/dev.db')).toBe(
      'M:/Projects/studylens/web/.data/dev.db',
    );
    expect(fileUrlToPath('file:///tmp/x.db')).toBe('/tmp/x.db');
  });
});

describe('openExecutor', () => {
  it('creates the folder of a local database file if it is missing', async () => {
    const { openExecutor } = await import('./executor');
    const { TEST_DB_DIR } = await import('./test-utils');
    const { existsSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const { randomUUID } = await import('node:crypto');
    const dir = join(TEST_DB_DIR, `new-folder-${randomUUID()}`);
    try {
      const ex = await openExecutor(pathToFileURL(join(dir, 'x.db')).href);
      await ex.execute({ sql: 'SELECT 1' });
      await ex.close();
      expect(existsSync(join(dir, 'x.db'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
