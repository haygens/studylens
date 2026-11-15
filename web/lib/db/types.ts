import type { SessionSummary } from '@studylens/shared';

/**
 * All server data access goes through this interface so the in-memory stub can be
 * swapped for Turso (P15) without touching API routes.
 */
export interface Db {
  /** Store an anonymous session summary (research upload, P17). */
  addSessionSummary(summary: SessionSummary): Promise<void>;
  listSessionSummaries(): Promise<SessionSummary[]>;
}
