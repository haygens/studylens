import type { GroupRole, GroupSummary } from '@studylens/shared';
import type { SqlExecutor, SqlStatement, SqlValue } from './executor';
import {
  ERROR_LOG_MAX_AGE_MS,
  GOAL_AFTER_END_MS,
  PARTICIPANT_STALE_MS,
  RATE_LIMIT_ROW_MAX_AGE_MS,
} from './retention';
import type { Db, Device, ErrorLog, ErrorSource } from './types';

const num = (v: SqlValue | undefined) => Number(v ?? 0);
const str = (v: SqlValue | undefined) => (v === null || v === undefined ? null : String(v));

/**
 * After a member left: if the group has no owner any more, the longest-standing member becomes
 * the owner. Written out (not left to ON DELETE CASCADE) so it never depends on the database
 * enforcing foreign keys.
 */
function promoteOwner(groupId: string): SqlStatement {
  return {
    sql: `UPDATE memberships SET role = 'owner'
          WHERE group_id = ?
            AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.group_id = ? AND o.role = 'owner')
            AND device_id = (SELECT x.device_id FROM memberships x WHERE x.group_id = ?
                             ORDER BY x.joined_at, x.device_id LIMIT 1)`,
    args: [groupId, groupId, groupId],
  };
}

/** Deletes the group (and its live sessions) if nobody is left in it. */
function pruneGroup(groupId: string): SqlStatement[] {
  const empty = 'NOT EXISTS (SELECT 1 FROM memberships m WHERE m.group_id = ?)';
  return [
    {
      sql: `DELETE FROM session_participants
            WHERE session_id IN (SELECT id FROM group_sessions WHERE group_id = ?) AND ${empty}`,
      args: [groupId, groupId],
    },
    { sql: `DELETE FROM group_sessions WHERE group_id = ? AND ${empty}`, args: [groupId, groupId] },
    { sql: `DELETE FROM groups WHERE id = ? AND ${empty}`, args: [groupId, groupId] },
  ];
}

/**
 * The libSQL implementation of `Db`. The executor must already be migrated (see `openDb` in
 * index.ts, or `runMigrations`).
 */
export function createSqlDb(sql: SqlExecutor): Db {
  return {
    async ping() {
      await sql.execute({ sql: 'SELECT 1' });
    },

    async createDevice(d) {
      await sql.execute({
        sql: `INSERT INTO devices (id, display_name, token_hash, created_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [d.id, d.displayName, d.tokenHash, d.createdAt, d.createdAt],
      });
    },

    async findDeviceByTokenHash(tokenHash) {
      const { rows } = await sql.execute({
        sql: `SELECT id, display_name, created_at, last_seen_at FROM devices WHERE token_hash = ?`,
        args: [tokenHash],
      });
      const r = rows[0];
      if (!r) return null;
      const device: Device = {
        id: String(r.id),
        displayName: String(r.display_name),
        createdAt: num(r.created_at),
        lastSeenAt: num(r.last_seen_at),
      };
      return device;
    },

    async touchDevice(id, now) {
      await sql.execute({
        sql: 'UPDATE devices SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?',
        args: [now, id, now],
      });
    },

    async updateDisplayName(id, displayName) {
      await sql.execute({
        sql: 'UPDATE devices SET display_name = ? WHERE id = ?',
        args: [displayName, id],
      });
    },

    async deleteDevice(id) {
      const { rows } = await sql.execute({
        sql: 'SELECT group_id FROM memberships WHERE device_id = ?',
        args: [id],
      });
      const groupIds = rows.map((r) => String(r.group_id));
      await sql.batch([
        { sql: 'DELETE FROM memberships WHERE device_id = ?', args: [id] },
        ...groupIds.flatMap((g) => [promoteOwner(g), ...pruneGroup(g)]),
        { sql: 'DELETE FROM session_participants WHERE device_id = ?', args: [id] },
        { sql: 'DELETE FROM device_presence WHERE device_id = ?', args: [id] },
        { sql: 'DELETE FROM daily_totals WHERE device_id = ?', args: [id] },
        { sql: 'UPDATE groups SET created_by = NULL WHERE created_by = ?', args: [id] },
        {
          sql: 'UPDATE group_sessions SET host_device_id = NULL WHERE host_device_id = ?',
          args: [id],
        },
        { sql: 'DELETE FROM devices WHERE id = ?', args: [id] },
      ]);
    },

    async createGroup(g, maxGroupsPerDevice) {
      // One transaction: the group row only appears if the device has room for another group,
      // and the owner membership only if the group row did.
      const [insert] = await sql.batch([
        {
          sql: `INSERT INTO groups (id, name, join_code, created_by, created_at)
                SELECT ?, ?, ?, ?, ?
                WHERE (SELECT COUNT(*) FROM memberships WHERE device_id = ?) < ?
                ON CONFLICT DO NOTHING`,
          args: [g.id, g.name, g.joinCode, g.deviceId, g.createdAt, g.deviceId, maxGroupsPerDevice],
        },
        {
          sql: `INSERT INTO memberships (group_id, device_id, role, joined_at)
                SELECT ?, ?, 'owner', ?
                WHERE EXISTS (SELECT 1 FROM groups WHERE id = ? AND join_code = ? AND created_by = ?)
                ON CONFLICT DO NOTHING`,
          args: [g.id, g.deviceId, g.createdAt, g.id, g.joinCode, g.deviceId],
        },
      ]);
      if (insert?.rowsAffected === 1) return { status: 'created' };
      const { rows } = await sql.execute({
        sql: 'SELECT COUNT(*) AS n FROM memberships WHERE device_id = ?',
        args: [g.deviceId],
      });
      return num(rows[0]?.n) >= maxGroupsPerDevice
        ? { status: 'too_many_groups' }
        : { status: 'code_taken' };
    },

    async joinGroup(joinCode, deviceId, now, limits) {
      // The limits are checked inside the INSERT itself (one statement, one transaction), so two
      // people joining at the same moment can't push a group past the member limit.
      const [insert, check] = await sql.batch([
        {
          sql: `INSERT INTO memberships (group_id, device_id, role, joined_at)
                SELECT g.id, ?, 'member', ? FROM groups g
                WHERE g.join_code = ?
                  AND (SELECT COUNT(*) FROM memberships m WHERE m.group_id = g.id) < ?
                  AND (SELECT COUNT(*) FROM memberships m WHERE m.device_id = ?) < ?
                ON CONFLICT DO NOTHING`,
          args: [deviceId, now, joinCode, limits.maxMembers, deviceId, limits.maxGroupsPerDevice],
        },
        {
          sql: `SELECT g.id,
                  (SELECT COUNT(*) FROM memberships m WHERE m.group_id = g.id) AS members,
                  EXISTS (SELECT 1 FROM memberships m WHERE m.group_id = g.id AND m.device_id = ?)
                    AS is_member
                FROM groups g WHERE g.join_code = ?`,
          args: [deviceId, joinCode],
        },
      ]);
      const row = check?.rows[0];
      if (!row) return { status: 'not_found' };
      const groupId = String(row.id);
      if (insert?.rowsAffected === 1) return { status: 'joined', groupId };
      if (num(row.is_member) === 1) return { status: 'already_member', groupId };
      if (num(row.members) >= limits.maxMembers) return { status: 'group_full' };
      return { status: 'too_many_groups' };
    },

    async listGroups(deviceId) {
      const [mine, members] = await Promise.all([
        sql.execute({
          sql: `SELECT g.id, g.name, g.join_code, my.role, my.joined_at
                FROM memberships my JOIN groups g ON g.id = my.group_id
                WHERE my.device_id = ?
                ORDER BY my.joined_at, g.id`,
          args: [deviceId],
        }),
        sql.execute({
          sql: `SELECT m.group_id, m.role, d.display_name, m.device_id = ? AS is_me
                FROM memberships m JOIN devices d ON d.id = m.device_id
                WHERE m.group_id IN (SELECT group_id FROM memberships WHERE device_id = ?)
                ORDER BY m.joined_at, m.device_id`,
          args: [deviceId, deviceId],
        }),
      ]);
      return mine.rows.map((r): GroupSummary => ({
        id: String(r.id),
        name: String(r.name),
        joinCode: String(r.join_code),
        role: String(r.role) as GroupRole,
        joinedAt: num(r.joined_at),
        members: members.rows
          .filter((m) => String(m.group_id) === String(r.id))
          .map((m) => ({
            displayName: String(m.display_name),
            role: String(m.role) as GroupRole,
            isMe: num(m.is_me) === 1,
          })),
      }));
    },

    async leaveGroup(groupId, deviceId) {
      const [removed] = await sql.batch([
        {
          sql: 'DELETE FROM memberships WHERE group_id = ? AND device_id = ?',
          args: [groupId, deviceId],
        },
        promoteOwner(groupId),
        ...pruneGroup(groupId),
      ]);
      return (removed?.rowsAffected ?? 0) > 0;
    },

    async addErrorLog(e) {
      await sql.execute({
        sql: `INSERT INTO error_logs (source, route, message, extension_version, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [e.source, e.route, e.message, e.extensionVersion, e.createdAt],
      });
    },

    async listErrorLogs(limit = 100) {
      const { rows } = await sql.execute({
        sql: `SELECT id, source, route, message, extension_version, created_at
              FROM error_logs ORDER BY created_at DESC, id DESC LIMIT ?`,
        args: [limit],
      });
      return rows.map((r): ErrorLog => ({
        id: num(r.id),
        source: String(r.source) as ErrorSource,
        route: str(r.route),
        message: String(r.message),
        extensionVersion: str(r.extension_version),
        createdAt: num(r.created_at),
      }));
    },

    async hitRateLimit(key, windowStart) {
      const { rows } = await sql.execute({
        sql: `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
              ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
              RETURNING count`,
        args: [key, windowStart],
      });
      return num(rows[0]?.count);
    },

    async cleanup(now) {
      const [errors, goals, presence, participants, limits] = await sql.batch([
        {
          sql: 'DELETE FROM error_logs WHERE created_at < ?',
          args: [now - ERROR_LOG_MAX_AGE_MS],
        },
        {
          // Ended (or past the planned end, if the host never ended it) more than 24 h ago.
          sql: `UPDATE group_sessions SET goal = NULL
                WHERE goal IS NOT NULL
                  AND COALESCE(ended_at, started_at + planned_minutes * 60000) < ?`,
          args: [now - GOAL_AFTER_END_MS],
        },
        { sql: 'DELETE FROM device_presence WHERE expires_at < ?', args: [now] },
        {
          sql: 'DELETE FROM session_participants WHERE last_heartbeat_at < ?',
          args: [now - PARTICIPANT_STALE_MS],
        },
        {
          sql: 'DELETE FROM rate_limits WHERE window_start < ?',
          args: [now - RATE_LIMIT_ROW_MAX_AGE_MS],
        },
      ]);
      return {
        errorLogsDeleted: errors?.rowsAffected ?? 0,
        goalsCleared: goals?.rowsAffected ?? 0,
        presenceRowsDeleted: presence?.rowsAffected ?? 0,
        participantRowsDeleted: participants?.rowsAffected ?? 0,
        rateLimitRowsDeleted: limits?.rowsAffected ?? 0,
      };
    },

    async close() {
      await sql.close();
    },
  };
}
