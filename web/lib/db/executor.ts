/**
 * A tiny SQL interface so the SQL data layer (`sql-db.ts`) doesn't care which driver runs it.
 *
 * Drivers:
 * - `@libsql/client` — Turso in production (remote URL), and local `file:` databases where its
 *   native driver loads (Linux CI, or Windows with the Visual C++ runtime installed).
 * - `node:sqlite` — Node's built-in SQLite, a fallback for local `file:` databases when the libSQL
 *   native driver can't load. Same SQLite dialect, so the same schema and queries run on both.
 */

export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  args?: SqlValue[];
}

export interface SqlResult {
  rows: Record<string, SqlValue>[];
  rowsAffected: number;
}

export interface SqlExecutor {
  /** Which driver this is, for logs and tests. */
  readonly driver: 'libsql' | 'node-sqlite';
  execute(stmt: SqlStatement): Promise<SqlResult>;
  /** Runs all statements in one transaction (all or nothing). */
  batch(stmts: SqlStatement[]): Promise<SqlResult[]>;
  close(): Promise<void>;
}

function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' || typeof value === 'string') return value;
  // The schema has no BLOB columns; anything else is a bug.
  throw new Error(`Unsupported SQL value type: ${typeof value}`);
}

/** Wraps an `@libsql/client` client (remote Turso or local file). */
export async function libsqlExecutor(url: string, authToken?: string): Promise<SqlExecutor> {
  // Remote URLs use the web client (fetch/WebSocket only, no native code). Only local files
  // need the native driver, which is loaded on demand.
  const { createClient } = url.startsWith('file:')
    ? await import('@libsql/client')
    : await import('@libsql/client/web');
  const client = createClient({ url, authToken: authToken || undefined, intMode: 'number' });

  const convert = (rs: {
    columns: string[];
    rows: ArrayLike<unknown>[];
    rowsAffected: number;
  }) => ({
    rows: rs.rows.map((row) =>
      Object.fromEntries(rs.columns.map((col, i) => [col, toSqlValue(row[i])])),
    ),
    rowsAffected: rs.rowsAffected,
  });

  if (url.startsWith('file:')) await client.execute('PRAGMA foreign_keys = ON');

  return {
    driver: 'libsql',
    async execute(stmt) {
      return convert(await client.execute({ sql: stmt.sql, args: stmt.args ?? [] }));
    },
    async batch(stmts) {
      const results = await client.batch(
        stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
        'write',
      );
      return results.map(convert);
    },
    async close() {
      client.close();
    },
  };
}

/** Wraps Node's built-in SQLite for a local database file. */
export async function nodeSqliteExecutor(path: string): Promise<SqlExecutor> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });

  const run = (stmt: SqlStatement): SqlResult => {
    const prepared = db.prepare(stmt.sql);
    const args = stmt.args ?? [];
    if (prepared.columns().length > 0) {
      const rows = prepared.all(...args) as Record<string, unknown>[];
      return {
        rows: rows.map((r) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toSqlValue(v)])),
        ),
        rowsAffected: rows.length,
      };
    }
    const info = prepared.run(...args);
    return { rows: [], rowsAffected: Number(info.changes) };
  };

  return {
    driver: 'node-sqlite',
    async execute(stmt) {
      return run(stmt);
    },
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const results = stmts.map(run);
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async close() {
      db.close();
    },
  };
}

/** `file:relative/path.db` or `file:///abs/path.db` → a path for `node:sqlite`. */
export function fileUrlToPath(url: string): string {
  const rest = url.slice('file:'.length);
  // file:///M:/x.db → M:/x.db; file:///tmp/x.db → /tmp/x.db; file:.data/x.db → .data/x.db
  const path = rest.startsWith('//') ? rest.slice(2) : rest;
  return decodeURIComponent(path.replace(/^\/(?=[A-Za-z]:)/, ''));
}

/**
 * Opens the right driver for a database URL. Local `file:` URLs try libSQL first and fall back
 * to `node:sqlite` when libSQL's native driver can't load on this machine.
 */
export async function openExecutor(url: string, authToken?: string): Promise<SqlExecutor> {
  if (!url.startsWith('file:')) return libsqlExecutor(url, authToken);
  // SQLite creates the file but not its folder (e.g. a fresh clone has no web/.data/).
  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(fileUrlToPath(url)), { recursive: true });
  try {
    return await libsqlExecutor(url);
  } catch (err) {
    console.warn(
      `[db] libSQL native driver unavailable (${(err as Error).message.split('\n')[0]}); ` +
        'using node:sqlite for the local database file.',
    );
    return nodeSqliteExecutor(fileUrlToPath(url));
  }
}
