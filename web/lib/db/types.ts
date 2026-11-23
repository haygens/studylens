/**
 * All server data access goes through this interface. Two implementations:
 * - `createSqlDb` (sql-db.ts): libSQL — Turso in production, a local file for dev/tests.
 * - `createMemoryDb` (memory.ts): in-memory stub for quick dev without a database file.
 *
 * Only what P15's endpoints need is here; group methods (P16/P18/P18b) are added with their
 * endpoints. The schema for them already exists (schema.ts).
 */

export interface Device {
  id: string;
  displayName: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds. */
  lastSeenAt: number;
}

export interface NewDevice {
  id: string;
  displayName: string;
  /** SHA-256 hex of the bearer token. The token itself is never stored. */
  tokenHash: string;
  createdAt: number;
}

export type ErrorSource = 'server' | 'extension';

export interface NewErrorLog {
  source: ErrorSource;
  /** Server route (`/api/devices`) or extension page (`popup`). */
  route: string | null;
  /** Already scrubbed (no URLs, domains, emails or IPs) and at most 500 characters. */
  message: string;
  extensionVersion: string | null;
  createdAt: number;
}

export interface ErrorLog extends NewErrorLog {
  id: number;
}

export interface CleanupResult {
  errorLogsDeleted: number;
  goalsCleared: number;
  presenceRowsDeleted: number;
  participantRowsDeleted: number;
  rateLimitRowsDeleted: number;
}

export interface Db {
  /** Throws if the database can't be reached. */
  ping(): Promise<void>;

  /** Throws if the token hash is already used (practically impossible for random tokens). */
  createDevice(device: NewDevice): Promise<void>;
  findDeviceByTokenHash(tokenHash: string): Promise<Device | null>;
  touchDevice(id: string, now: number): Promise<void>;

  addErrorLog(entry: NewErrorLog): Promise<void>;
  /** Newest first. */
  listErrorLogs(limit?: number): Promise<ErrorLog[]>;

  /** Adds one hit to the counter for `key` in the window starting at `windowStart`; returns the new count. */
  hitRateLimit(key: string, windowStart: number): Promise<number>;

  /** Retention job (daily Vercel Cron). See retention.ts for the rules. */
  cleanup(now: number): Promise<CleanupResult>;

  close(): Promise<void>;
}
