import { openExecutor } from './executor';
import { createMemoryDb } from './memory';
import { runMigrations } from './migrate';
import { createSqlDb } from './sql-db';
import type { Db } from './types';

export type { Db, Device, ErrorLog, NewErrorLog, CleanupResult } from './types';

type Env = Record<string, string | undefined>;

/**
 * Opens the database named by the environment:
 * - `TURSO_DATABASE_URL` set → libSQL (a `libsql://…` Turso URL with `TURSO_AUTH_TOKEN`, or a
 *   local `file:.data/dev.db`, relative to `web/`). Migrations run on open.
 * - not set, outside production → the in-memory stub.
 * - not set, in production → error (health reports `db: "down"`).
 */
export async function openDb(env: Env = process.env): Promise<Db> {
  const url = env.TURSO_DATABASE_URL?.trim();
  if (!url) {
    if (env.NODE_ENV === 'production') throw new Error('TURSO_DATABASE_URL is not set');
    return createMemoryDb();
  }
  const executor = await openExecutor(url, env.TURSO_AUTH_TOKEN?.trim());
  try {
    await runMigrations(executor);
  } catch (err) {
    await executor.close();
    throw err;
  }
  return createSqlDb(executor);
}

let dbPromise: Promise<Db> | undefined;

/** The app's shared database (opened once per server instance). */
export function getDb(): Promise<Db> {
  dbPromise ??= openDb().catch((err: unknown) => {
    dbPromise = undefined; // try again on the next request
    throw err;
  });
  return dbPromise;
}

/** Tests only: use this database for the next `getDb()` calls (or reset with `undefined`). */
export function setDbForTests(db: Db | undefined): void {
  dbPromise = db ? Promise.resolve(db) : undefined;
}
