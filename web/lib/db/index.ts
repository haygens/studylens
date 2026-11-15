import { createMemoryDb } from './memory';
import type { Db } from './types';

export type { Db } from './types';

let db: Db | undefined;

/** Returns the app's database. Swap in the Turso implementation in P15. */
export function getDb(): Db {
  db ??= createMemoryDb();
  return db;
}
