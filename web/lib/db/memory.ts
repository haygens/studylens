import type { SessionSummary } from '@studylens/shared';
import type { Db } from './types';

/** In-memory stub. Data is lost on restart — for development and tests only. */
export function createMemoryDb(): Db {
  const summaries: SessionSummary[] = [];
  return {
    async addSessionSummary(summary) {
      summaries.push({ ...summary });
    },
    async listSessionSummaries() {
      return summaries.map((s) => ({ ...s }));
    },
  };
}
