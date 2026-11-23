/**
 * Test helpers: temporary local database files.
 *
 * Files go in `STUDYLENS_TEST_DB_DIR` if set (CI sets it to the runner's temp folder), otherwise
 * `web/.data/test/` — inside the repo, so on M: locally. Each file is deleted after its test.
 *
 * Drivers: `node-sqlite` always runs. `libsql` runs when its native driver loads on this machine;
 * with `REQUIRE_LIBSQL=1` (set in CI) a missing libSQL driver fails the tests instead of skipping.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { libsqlExecutor, nodeSqliteExecutor, type SqlExecutor } from './executor';
import { runMigrations } from './migrate';
import { createSqlDb } from './sql-db';
import type { Db } from './types';

export type TestDriver = SqlExecutor['driver'];

export const TEST_DB_DIR =
  process.env.STUDYLENS_TEST_DB_DIR || fileURLToPath(new URL('../../.data/test', import.meta.url));

let libsqlCheck: Promise<boolean> | undefined;

/** True when `@libsql/client` can open a local file on this machine. */
export function libsqlAvailable(): Promise<boolean> {
  libsqlCheck ??= (async () => {
    const path = tempDbPath();
    try {
      const ex = await libsqlExecutor(pathToFileURL(path).href);
      await ex.close();
      return true;
    } catch {
      return false;
    } finally {
      removeDbFiles(path);
    }
  })();
  return libsqlCheck;
}

/** The drivers to test with on this machine. */
export async function testDrivers(): Promise<TestDriver[]> {
  if (await libsqlAvailable()) return ['libsql', 'node-sqlite'];
  if (process.env.REQUIRE_LIBSQL === '1') {
    throw new Error('REQUIRE_LIBSQL=1 but the libSQL native driver could not load');
  }
  return ['node-sqlite'];
}

/** libSQL when available, else node:sqlite (for API tests that just need a real database). */
export async function preferredDriver(): Promise<TestDriver> {
  return (await testDrivers())[0]!;
}

export function tempDbPath(): string {
  mkdirSync(TEST_DB_DIR, { recursive: true });
  return join(TEST_DB_DIR, `test-${randomUUID()}.db`);
}

function removeDbFiles(path: string): void {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(path + suffix, { force: true });
  }
}

export interface TestDb {
  db: Db;
  sql: SqlExecutor;
  path: string;
  /** Closes the database and deletes its file. */
  dispose(): Promise<void>;
}

/** A fresh, migrated database in a temporary file. */
export async function openTestDb(
  driver: TestDriver,
  opts: { migrate?: boolean } = {},
): Promise<TestDb> {
  const path = tempDbPath();
  const sql =
    driver === 'libsql'
      ? await libsqlExecutor(pathToFileURL(path).href)
      : await nodeSqliteExecutor(path);
  if (opts.migrate !== false) await runMigrations(sql);
  return {
    db: createSqlDb(sql),
    sql,
    path,
    async dispose() {
      await sql.close();
      removeDbFiles(path);
    },
  };
}
