/**
 * Before the E2E run: delete database files left by earlier runs of the local web API (in
 * web/.data/e2e/, on M: locally). This run's file is never touched (the server may have it open).
 */
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { E2E_DB_DIR, e2eDbName } from './web-server';

export default function globalSetup(): void {
  let names: string[];
  try {
    names = readdirSync(E2E_DB_DIR);
  } catch {
    return; // No folder yet.
  }
  const current = e2eDbName();
  for (const name of names) {
    if (name.startsWith(current)) continue; // also its -journal / -wal files
    try {
      rmSync(path.join(E2E_DB_DIR, name), { force: true });
    } catch {
      // Still in use (e.g. a server from another run); removed next time.
    }
  }
}
