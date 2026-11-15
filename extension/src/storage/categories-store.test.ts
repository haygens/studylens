import { describe, expect, it } from 'vitest';
import { memoryStore } from './activity-store';
import { RULES_KEY, loadRules, saveRules } from './categories-store';

describe('categories store', () => {
  it('starts empty — nothing is pre-labeled', async () => {
    expect(await loadRules(memoryStore())).toEqual([]);
  });

  it('round-trips rules, sorted by domain', async () => {
    const store = memoryStore();
    await saveRules(store, [
      { domain: 'youtube.com', category: 'distraction' },
      { domain: 'github.com', category: 'study' },
    ]);
    expect(await loadRules(store)).toEqual([
      { domain: 'github.com', category: 'study' },
      { domain: 'youtube.com', category: 'distraction' },
    ]);
  });

  it('drops malformed entries and de-duplicates by domain', async () => {
    const store = memoryStore({
      [RULES_KEY]: [
        { domain: 'a.com', category: 'study' },
        { domain: 'A.com', category: 'distraction' },
        { domain: 'b.com', category: 'blocked' },
        { domain: 'com', category: 'study' },
        null,
        'c.com',
      ],
    });
    expect(await loadRules(store)).toEqual([{ domain: 'a.com', category: 'distraction' }]);
  });
});
