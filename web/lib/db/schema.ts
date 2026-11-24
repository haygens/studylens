/**
 * Database schema, as numbered migrations. Never edit a migration after it has shipped: add a new
 * one with the next version number instead.
 *
 * Privacy (see PRIVACY.md and docs/backend.md): no browsing data, no hostnames or URLs, no IP
 * addresses, no emails. Times are epoch milliseconds (INTEGER). Tokens are stored only as SHA-256
 * hashes. Group session goals are optional and cleared 24 h after the session ends.
 *
 * The group tables are designed now for P16 (join with a code), P18 (passive groups) and P18b
 * (live group sessions); P15 only builds the device and error-log endpoints.
 */

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    statements: [
      // One row per installed extension that registered (P16). No email, no account.
      `CREATE TABLE IF NOT EXISTS devices (
        id            TEXT PRIMARY KEY,
        display_name  TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 30),
        token_hash    TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
        created_at    INTEGER NOT NULL,
        last_seen_at  INTEGER NOT NULL
      )`,

      // Study groups (P16/P18). Joined with a short join code.
      `CREATE TABLE IF NOT EXISTS groups (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
        join_code   TEXT NOT NULL UNIQUE,
        created_by  TEXT REFERENCES devices(id) ON DELETE SET NULL,
        created_at  INTEGER NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS memberships (
        group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
        joined_at  INTEGER NOT NULL,
        PRIMARY KEY (group_id, device_id)
      )`,
      `CREATE INDEX IF NOT EXISTS memberships_by_device ON memberships (device_id)`,

      // Live group focus sessions (P18b). `goal` is optional and cleared 24 h after the end.
      `CREATE TABLE IF NOT EXISTS group_sessions (
        id               TEXT PRIMARY KEY,
        group_id         TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        host_device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL,
        goal             TEXT CHECK (goal IS NULL OR length(goal) BETWEEN 1 AND 120),
        planned_minutes  INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 240),
        started_at       INTEGER NOT NULL,
        ended_at         INTEGER CHECK (ended_at IS NULL OR ended_at >= started_at)
      )`,
      `CREATE INDEX IF NOT EXISTS group_sessions_by_group ON group_sessions (group_id, started_at)`,

      // Who is in a live group session, and their live status (P18b). `focus_minutes` is set
      // only if the member chooses to share it in the group summary.
      `CREATE TABLE IF NOT EXISTS session_participants (
        session_id         TEXT NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
        device_id          TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        status             TEXT NOT NULL CHECK (status IN ('focusing', 'finished', 'left')),
        joined_at          INTEGER NOT NULL,
        last_heartbeat_at  INTEGER NOT NULL,
        focus_minutes      INTEGER CHECK (focus_minutes IS NULL OR focus_minutes BETWEEN 0 AND 1440),
        PRIMARY KEY (session_id, device_id)
      )`,

      // "Who's in a (solo) session right now" for passive groups (P18). One row per device while
      // it is focusing; deleted once it expires.
      `CREATE TABLE IF NOT EXISTS device_presence (
        device_id   TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
        since       INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL CHECK (expires_at >= since)
      )`,

      // Daily focus minutes per device (P18). Focus minutes ONLY: no sites, no categories.
      `CREATE TABLE IF NOT EXISTS daily_totals (
        device_id      TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        local_date     TEXT NOT NULL
                       CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
        focus_minutes  INTEGER NOT NULL CHECK (focus_minutes BETWEEN 0 AND 1440),
        updated_at     INTEGER NOT NULL,
        PRIMARY KEY (device_id, local_date)
      )`,

      // Server and extension error messages (scrubbed, no user data). Deleted after 14 days.
      // Deliberately not linked to a device.
      `CREATE TABLE IF NOT EXISTS error_logs (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        source             TEXT NOT NULL CHECK (source IN ('server', 'extension')),
        route              TEXT,
        message            TEXT NOT NULL CHECK (length(message) <= 500),
        extension_version  TEXT,
        created_at         INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS error_logs_by_time ON error_logs (created_at)`,

      // Fixed-window request counters for rate limiting. The key is "<rule>:<device id>" (or a
      // global key); never an IP address. Old windows are deleted by the daily cleanup.
      `CREATE TABLE IF NOT EXISTS rate_limits (
        key           TEXT NOT NULL,
        window_start  INTEGER NOT NULL,
        count         INTEGER NOT NULL,
        PRIMARY KEY (key, window_start)
      )`,
    ],
  },
  {
    version: 2,
    name: 'passive-groups',
    statements: [
      // P18: each member's switches per group. Existing memberships start with both OFF: nobody
      // shares anything they didn't choose to (new joins send their choice explicitly).
      `ALTER TABLE memberships ADD COLUMN share_minutes INTEGER NOT NULL DEFAULT 0
         CHECK (share_minutes IN (0, 1))`,
      `ALTER TABLE memberships ADD COLUMN share_presence INTEGER NOT NULL DEFAULT 0
         CHECK (share_presence IN (0, 1))`,
      // For the daily cleanup of totals older than 14 days.
      `CREATE INDEX IF NOT EXISTS daily_totals_by_date ON daily_totals (local_date)`,
    ],
  },
];

/** Every table the app creates (for tests and docs). */
export const TABLES = [
  'devices',
  'groups',
  'memberships',
  'group_sessions',
  'session_participants',
  'device_presence',
  'daily_totals',
  'error_logs',
  'rate_limits',
] as const;
