import {
  addDays,
  utcDate,
  type GroupRole,
  type GroupSummary,
  type LiveSession,
  type ParticipantStatus,
} from '@studylens/shared';
import type { SqlExecutor, SqlStatement, SqlValue } from './executor';
import { buildLiveSession } from './live';
import { buildOverviewMembers, historyStart } from './overview';
import {
  DAILY_TOTALS_KEEP_DAYS,
  ERROR_LOG_MAX_AGE_MS,
  GOAL_AFTER_END_MS,
  LIVE_SESSION_KEEP_MS,
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
 * P18: deletes the device's daily totals / presence once none of its groups shares them any more
 * (after a switch was turned off, or after leaving a group).
 */
function pruneUnshared(deviceId: string): SqlStatement[] {
  return [
    {
      sql: `DELETE FROM daily_totals WHERE device_id = ? AND NOT EXISTS
              (SELECT 1 FROM memberships WHERE device_id = ? AND share_minutes = 1)`,
      args: [deviceId, deviceId],
    },
    {
      sql: `DELETE FROM device_presence WHERE device_id = ? AND NOT EXISTS
              (SELECT 1 FROM memberships WHERE device_id = ? AND share_presence = 1)`,
      args: [deviceId, deviceId],
    },
  ];
}

const bit = (b: boolean) => (b ? 1 : 0);

/**
 * P18b: live session `alias` is running at the `?` time (one argument): not ended, before its
 * shared end, and someone is still focusing in it. Same rule as `isRunning` in live.ts.
 */
const runningSql = (alias: string) =>
  `${alias}.ended_at IS NULL AND ${alias}.ends_at > ? AND EXISTS (SELECT 1 FROM
     session_participants rp WHERE rp.session_id = ${alias}.id AND rp.status = 'focusing')`;

/**
 * P18b: the device (`?`) is focusing in a live session (other than `alias`, if given) that hasn't
 * reached its end at the `?` time. One live session at a time per device.
 */
const busySql = (alias: string | null) =>
  `EXISTS (SELECT 1 FROM session_participants bp JOIN group_sessions bs ON bs.id = bp.session_id
     WHERE bp.device_id = ? AND bp.status = 'focusing'${alias ? ` AND bs.id <> ${alias}.id` : ''}
       AND bs.ended_at IS NULL AND bs.ends_at > ?)`;

/** P18b: live sessions nobody is focusing in any more (everyone left) end now. */
function endAbandoned(now: number): SqlStatement {
  return {
    sql: `UPDATE group_sessions SET ended_at = ?
          WHERE ended_at IS NULL AND ends_at > ? AND started_at <= ?
            AND NOT EXISTS (SELECT 1 FROM session_participants p
                            WHERE p.session_id = group_sessions.id AND p.status = 'focusing')`,
    args: [now, now, now],
  };
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

    async deleteDevice(id, now = Date.now()) {
      const { rows } = await sql.execute({
        sql: 'SELECT group_id FROM memberships WHERE device_id = ?',
        args: [id],
      });
      const groupIds = rows.map((r) => String(r.group_id));
      await sql.batch([
        { sql: 'DELETE FROM memberships WHERE device_id = ?', args: [id] },
        ...groupIds.flatMap((g) => [promoteOwner(g), ...pruneGroup(g)]),
        { sql: 'DELETE FROM session_participants WHERE device_id = ?', args: [id] },
        endAbandoned(now),
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
          sql: `INSERT INTO memberships
                  (group_id, device_id, role, joined_at, share_minutes, share_presence)
                SELECT ?, ?, 'owner', ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM groups WHERE id = ? AND join_code = ? AND created_by = ?)
                ON CONFLICT DO NOTHING`,
          args: [
            g.id,
            g.deviceId,
            g.createdAt,
            bit(g.sharing.focusMinutes),
            bit(g.sharing.focusingNow),
            g.id,
            g.joinCode,
            g.deviceId,
          ],
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

    async joinGroup(joinCode, deviceId, now, limits, sharing) {
      // The limits are checked inside the INSERT itself (one statement, one transaction), so two
      // people joining at the same moment can't push a group past the member limit.
      const [insert, check] = await sql.batch([
        {
          sql: `INSERT INTO memberships
                  (group_id, device_id, role, joined_at, share_minutes, share_presence)
                SELECT g.id, ?, 'member', ?, ?, ? FROM groups g
                WHERE g.join_code = ?
                  AND (SELECT COUNT(*) FROM memberships m WHERE m.group_id = g.id) < ?
                  AND (SELECT COUNT(*) FROM memberships m WHERE m.device_id = ?) < ?
                ON CONFLICT DO NOTHING`,
          args: [
            deviceId,
            now,
            bit(sharing.focusMinutes),
            bit(sharing.focusingNow),
            joinCode,
            limits.maxMembers,
            deviceId,
            limits.maxGroupsPerDevice,
          ],
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
          sql: `SELECT g.id, g.name, g.join_code, my.role, my.joined_at,
                       my.share_minutes, my.share_presence
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
        sharing: {
          focusMinutes: num(r.share_minutes) === 1,
          focusingNow: num(r.share_presence) === 1,
        },
      }));
    },

    async leaveGroup(groupId, deviceId, now = Date.now()) {
      const [removed] = await sql.batch([
        {
          sql: 'DELETE FROM memberships WHERE group_id = ? AND device_id = ?',
          args: [groupId, deviceId],
        },
        // P18b: out of the group's live sessions too (non-members can't see them any more).
        {
          sql: `DELETE FROM session_participants WHERE device_id = ?
                  AND session_id IN (SELECT id FROM group_sessions WHERE group_id = ?)`,
          args: [deviceId, groupId],
        },
        endAbandoned(now),
        promoteOwner(groupId),
        ...pruneGroup(groupId),
        ...pruneUnshared(deviceId),
      ]);
      return (removed?.rowsAffected ?? 0) > 0;
    },

    async updateSharing(groupId, deviceId, patch) {
      const toArg = (v: boolean | undefined) => (v === undefined ? null : bit(v));
      const results = await sql.batch([
        {
          sql: `UPDATE memberships
                SET share_minutes = COALESCE(?, share_minutes),
                    share_presence = COALESCE(?, share_presence)
                WHERE group_id = ? AND device_id = ?`,
          args: [toArg(patch.focusMinutes), toArg(patch.focusingNow), groupId, deviceId],
        },
        ...pruneUnshared(deviceId),
        {
          sql: `SELECT share_minutes, share_presence FROM memberships
                WHERE group_id = ? AND device_id = ?`,
          args: [groupId, deviceId],
        },
      ]);
      const row = results.at(-1)?.rows[0];
      if (!row) return null;
      return {
        focusMinutes: num(row.share_minutes) === 1,
        focusingNow: num(row.share_presence) === 1,
      };
    },

    async upsertDailyTotals(deviceId, days, now) {
      const results = await sql.batch([
        ...days.map((d): SqlStatement => ({
          sql: `INSERT INTO daily_totals (device_id, local_date, focus_minutes, updated_at)
                  SELECT ?, ?, ?, ?
                  WHERE EXISTS (SELECT 1 FROM memberships WHERE device_id = ? AND share_minutes = 1)
                  ON CONFLICT (device_id, local_date) DO UPDATE
                    SET focus_minutes = excluded.focus_minutes, updated_at = excluded.updated_at`,
          args: [deviceId, d.localDate, d.focusMinutes, now, deviceId],
        })),
        ...pruneUnshared(deviceId),
      ]);
      return results.slice(0, days.length).filter((r) => r.rowsAffected > 0).length;
    },

    async setPresence(deviceId, state, now, ttlMs) {
      if (state === 'stop') {
        await sql.execute({
          sql: 'DELETE FROM device_presence WHERE device_id = ?',
          args: [deviceId],
        });
        return false;
      }
      const [upsert] = await sql.batch([
        {
          // `start` begins a new focusing period; a heartbeat keeps `since` unless it had expired.
          sql: `INSERT INTO device_presence (device_id, since, expires_at)
                SELECT ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM memberships WHERE device_id = ? AND share_presence = 1)
                ON CONFLICT (device_id) DO UPDATE
                  SET since = CASE WHEN ? = 'start' OR device_presence.expires_at <= excluded.since
                                   THEN excluded.since ELSE device_presence.since END,
                      expires_at = excluded.expires_at`,
          args: [deviceId, now, now + ttlMs, deviceId, state],
        },
        ...pruneUnshared(deviceId),
      ]);
      return (upsert?.rowsAffected ?? 0) > 0;
    },

    async groupOverview(groupId, deviceId, q) {
      const [members, totals] = await Promise.all([
        sql.execute({
          sql: `SELECT g.name, m.device_id, m.device_id = ? AS is_me, m.role, d.display_name,
                       m.share_minutes, m.share_presence,
                       EXISTS (SELECT 1 FROM device_presence p
                               WHERE p.device_id = m.device_id AND p.expires_at > ?) AS focusing
                FROM memberships m
                  JOIN devices d ON d.id = m.device_id
                  JOIN groups g ON g.id = m.group_id
                WHERE m.group_id = ?
                ORDER BY m.joined_at, m.device_id`,
          args: [deviceId, q.now, groupId],
        }),
        sql.execute({
          sql: `SELECT t.device_id, t.local_date, t.focus_minutes
                FROM daily_totals t
                  JOIN memberships m ON m.device_id = t.device_id
                WHERE m.group_id = ? AND m.share_minutes = 1
                  AND t.local_date BETWEEN ? AND ?`,
          args: [groupId, historyStart(q), q.today],
        }),
      ]);
      const first = members.rows[0];
      if (!first || !members.rows.some((r) => num(r.is_me) === 1)) return null;
      return {
        group: { id: groupId, name: String(first.name) },
        members: buildOverviewMembers(
          members.rows.map((r) => ({
            deviceId: String(r.device_id),
            displayName: String(r.display_name),
            role: String(r.role) as GroupRole,
            isMe: num(r.is_me) === 1,
            shareMinutes: num(r.share_minutes) === 1,
            sharePresence: num(r.share_presence) === 1,
            focusing: num(r.focusing) === 1,
          })),
          totals.rows.map((r) => ({
            deviceId: String(r.device_id),
            localDate: String(r.local_date),
            focusMinutes: num(r.focus_minutes),
          })),
          q,
        ),
      };
    },

    async countFocusingNow(deviceId, now) {
      const { rows } = await sql.execute({
        sql: `SELECT COUNT(DISTINCT m.device_id) AS n
              FROM memberships m
                JOIN memberships mine ON mine.group_id = m.group_id AND mine.device_id = ?
                JOIN device_presence p ON p.device_id = m.device_id AND p.expires_at > ?
              WHERE m.device_id <> ? AND m.share_presence = 1`,
        args: [deviceId, now, deviceId],
      });
      return num(rows[0]?.n);
    },

    async startLiveSession(n) {
      const [insert] = await sql.batch([
        {
          sql: `INSERT INTO group_sessions
                  (id, group_id, host_device_id, goal, planned_minutes, started_at, ends_at)
                SELECT ?, ?, ?, ?, ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM memberships WHERE group_id = ? AND device_id = ?)
                  AND NOT EXISTS (SELECT 1 FROM group_sessions s
                                  WHERE s.group_id = ? AND ${runningSql('s')})
                  AND NOT ${busySql(null)}`,
          args: [
            n.id,
            n.groupId,
            n.hostDeviceId,
            n.goal,
            n.plannedMinutes,
            n.startedAt,
            n.endsAt,
            n.groupId,
            n.hostDeviceId,
            n.groupId,
            n.startedAt,
            n.hostDeviceId,
            n.startedAt,
          ],
        },
        {
          sql: `INSERT INTO session_participants
                  (session_id, device_id, status, joined_at, last_heartbeat_at)
                SELECT ?, ?, 'focusing', ?, ?
                WHERE EXISTS (SELECT 1 FROM group_sessions WHERE id = ? AND host_device_id = ?)
                ON CONFLICT DO NOTHING`,
          args: [n.id, n.hostDeviceId, n.startedAt, n.startedAt, n.id, n.hostDeviceId],
        },
      ]);
      if (insert?.rowsAffected === 1) return { status: 'started' };
      const { rows } = await sql.execute({
        sql: `SELECT EXISTS (SELECT 1 FROM memberships WHERE group_id = ? AND device_id = ?) AS member,
                     EXISTS (SELECT 1 FROM group_sessions s
                             WHERE s.group_id = ? AND ${runningSql('s')}) AS running`,
        args: [n.groupId, n.hostDeviceId, n.groupId, n.startedAt],
      });
      if (num(rows[0]?.member) !== 1) return { status: 'not_member' };
      return num(rows[0]?.running) === 1 ? { status: 'session_running' } : { status: 'busy' };
    },

    async listLiveSessions(deviceId, now) {
      return loadLive(sql, runningSql('s'), [now], deviceId, now);
    },

    async liveSession(sessionId, deviceId, now) {
      return (await loadLive(sql, 's.id = ?', [sessionId], deviceId, now))[0] ?? null;
    },

    async joinLiveSession(sessionId, deviceId, now) {
      const [insert] = await sql.batch([
        {
          sql: `INSERT INTO session_participants
                  (session_id, device_id, status, joined_at, last_heartbeat_at)
                SELECT s.id, ?, 'focusing', ?, ? FROM group_sessions s
                WHERE s.id = ?
                  AND EXISTS (SELECT 1 FROM memberships m
                              WHERE m.group_id = s.group_id AND m.device_id = ?)
                  AND ${runningSql('s')}
                  AND NOT ${busySql('s')}
                ON CONFLICT DO NOTHING`,
          args: [deviceId, now, now, sessionId, deviceId, now, deviceId, now],
        },
        heartbeat(sessionId, deviceId, now),
      ]);
      return (insert?.rowsAffected ?? 0) > 0;
    },

    async leaveLiveSession(sessionId, deviceId, now) {
      const [left] = await sql.batch([
        {
          sql: `UPDATE session_participants SET status = 'left', left_at = ?
                WHERE session_id = ? AND device_id = ? AND status = 'focusing'
                  AND EXISTS (SELECT 1 FROM group_sessions s
                              WHERE s.id = session_participants.session_id
                                AND s.ended_at IS NULL AND s.ends_at > ?)`,
          args: [now, sessionId, deviceId, now],
        },
        endAbandoned(now),
      ]);
      return (left?.rowsAffected ?? 0) > 0;
    },

    async heartbeatLiveSession(sessionId, deviceId, now) {
      return (await sql.execute(heartbeat(sessionId, deviceId, now))).rowsAffected > 0;
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
      const liveCutoff = now - LIVE_SESSION_KEEP_MS;
      const results = await sql.batch([
        {
          sql: 'DELETE FROM error_logs WHERE created_at < ?',
          args: [now - ERROR_LOG_MAX_AGE_MS],
        },
        {
          // Ended (or past the shared end time) more than 24 h ago.
          sql: `UPDATE group_sessions SET goal = NULL
                WHERE goal IS NOT NULL AND COALESCE(ended_at, ends_at) < ?`,
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
        {
          sql: 'DELETE FROM daily_totals WHERE local_date < ?',
          args: [addDays(utcDate(now), -DAILY_TOTALS_KEEP_DAYS)],
        },
        // P18b: live sessions past their shared end time: whoever was still in it finished.
        {
          sql: `UPDATE session_participants SET status = 'finished'
                WHERE status = 'focusing'
                  AND session_id IN (SELECT id FROM group_sessions WHERE ends_at <= ?)`,
          args: [now],
        },
        {
          sql: 'UPDATE group_sessions SET ended_at = ends_at WHERE ended_at IS NULL AND ends_at <= ?',
          args: [now],
        },
        // 24 h after the end the whole session goes (its goal is already cleared above), with
        // its participant rows.
        {
          sql: `DELETE FROM session_participants WHERE session_id IN
                  (SELECT id FROM group_sessions WHERE COALESCE(ended_at, ends_at) < ?)`,
          args: [liveCutoff],
        },
        {
          sql: 'DELETE FROM group_sessions WHERE COALESCE(ended_at, ends_at) < ?',
          args: [liveCutoff],
        },
      ]);
      const [errors, goals, presence, participants, limits, totals, , ended, , liveDeleted] =
        results;
      return {
        errorLogsDeleted: errors?.rowsAffected ?? 0,
        goalsCleared: goals?.rowsAffected ?? 0,
        presenceRowsDeleted: presence?.rowsAffected ?? 0,
        participantRowsDeleted: participants?.rowsAffected ?? 0,
        rateLimitRowsDeleted: limits?.rowsAffected ?? 0,
        dailyTotalsDeleted: totals?.rowsAffected ?? 0,
        groupSessionsEnded: ended?.rowsAffected ?? 0,
        groupSessionsDeleted: liveDeleted?.rowsAffected ?? 0,
      };
    },

    async close() {
      await sql.close();
    },
  };
}

/** P18b: my heartbeat in a live session I'm still focusing in (before its end). */
function heartbeat(sessionId: string, deviceId: string, now: number): SqlStatement {
  return {
    sql: `UPDATE session_participants SET last_heartbeat_at = ?
          WHERE session_id = ? AND device_id = ? AND status = 'focusing'
            AND EXISTS (SELECT 1 FROM group_sessions s WHERE s.id = session_participants.session_id
                          AND s.ended_at IS NULL AND s.ends_at > ?)`,
    args: [now, sessionId, deviceId, now],
  };
}

/** P18b: live sessions matching `where` in groups the viewer is in, as the viewer sees them. */
async function loadLive(
  sql: SqlExecutor,
  where: string,
  args: SqlValue[],
  viewerId: string,
  now: number,
): Promise<LiveSession[]> {
  const sessions = await sql.execute({
    sql: `SELECT s.id, s.group_id, g.name AS group_name, s.host_device_id, s.goal,
                 s.planned_minutes, s.started_at, s.ends_at, s.ended_at
          FROM group_sessions s
            JOIN groups g ON g.id = s.group_id
            JOIN memberships mine ON mine.group_id = s.group_id AND mine.device_id = ?
          WHERE ${where}
          ORDER BY mine.joined_at, s.started_at`,
    args: [viewerId, ...args],
  });
  if (sessions.rows.length === 0) return [];
  const ids = sessions.rows.map((r) => String(r.id));
  const parts = await sql.execute({
    sql: `SELECT p.session_id, p.device_id, d.display_name, p.status, p.joined_at,
                 p.last_heartbeat_at, p.left_at, COALESCE(m.share_minutes, 0) AS share_minutes
          FROM session_participants p
            JOIN devices d ON d.id = p.device_id
            JOIN group_sessions s ON s.id = p.session_id
            LEFT JOIN memberships m ON m.group_id = s.group_id AND m.device_id = p.device_id
          WHERE p.session_id IN (${ids.map(() => '?').join(', ')})`,
    args: ids,
  });
  return sessions.rows.map((r) =>
    buildLiveSession(
      {
        id: String(r.id),
        groupId: String(r.group_id),
        groupName: String(r.group_name),
        hostDeviceId: str(r.host_device_id),
        goal: str(r.goal),
        plannedMinutes: num(r.planned_minutes),
        startedAt: num(r.started_at),
        endsAt: num(r.ends_at),
        endedAt: r.ended_at === null ? null : num(r.ended_at),
      },
      parts.rows
        .filter((p) => String(p.session_id) === String(r.id))
        .map((p) => ({
          deviceId: String(p.device_id),
          displayName: String(p.display_name),
          status: String(p.status) as ParticipantStatus,
          joinedAt: num(p.joined_at),
          lastHeartbeatAt: num(p.last_heartbeat_at),
          leftAt: p.left_at === null ? null : num(p.left_at),
          sharesMinutes: num(p.share_minutes) === 1,
        })),
      viewerId,
      now,
    ),
  );
}
