import type { SqlExecutor, SqlValue } from './executor';
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
