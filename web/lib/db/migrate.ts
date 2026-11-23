import type { SqlExecutor } from './executor';
import { MIGRATIONS, type Migration } from './schema';

/**
 * Applies every migration newer than the database's current version, each in its own
 * transaction. Safe to run on every cold start and from two instances at once: tables use
 * IF NOT EXISTS and the version row uses INSERT OR IGNORE.
 *
 * @returns the versions that were applied by this call.
 */
export async function runMigrations(
  db: SqlExecutor,
  migrations: Migration[] = MIGRATIONS,
  now: number = Date.now(),
): Promise<number[]> {
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  INTEGER NOT NULL
    )`,
  });
  const current = await currentVersion(db);
  const applied: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    await db.batch([
      ...m.statements.map((sql) => ({ sql })),
      {
        sql: 'INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        args: [m.version, m.name, now],
      },
    ]);
    applied.push(m.version);
  }
  return applied;
}

export async function currentVersion(db: SqlExecutor): Promise<number> {
  const { rows } = await db.execute({
    sql: 'SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations',
  });
  return Number(rows[0]?.v ?? 0);
}
