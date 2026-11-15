import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '@studylens/shared';
import { createMemoryDb } from './memory';

const sample: SessionSummary = {
  id: 's1',
  condition: 'control',
  startedAt: 0,
  endedAt: 25 * 60_000,
  focusMinutes: 22,
  distractionMinutes: 3,
  distractionVisits: 2,
};

describe('createMemoryDb', () => {
  it('stores and lists session summaries', async () => {
    const db = createMemoryDb();
    await db.addSessionSummary(sample);
    expect(await db.listSessionSummaries()).toEqual([sample]);
  });
});
