import { describe, expect, it } from 'vitest';
import { memoryStore } from './activity-store';
import { THEME_KEY, asTheme, loadTheme, saveTheme } from './theme-store';
import { keysToDelete } from './keys';

describe('theme store', () => {
  it('defaults to Sunrise when nothing (or nonsense) is stored', async () => {
    expect(await loadTheme(memoryStore())).toBe('sunrise');
    expect(asTheme('neon')).toBe('sunrise');
    expect(asTheme(null)).toBe('sunrise');
  });

  it('saves and loads the choice under ui:theme', async () => {
    const store = memoryStore();
    await saveTheme(store, 'pastel');
    expect(store.data).toEqual({ [THEME_KEY]: 'pastel' });
    expect(THEME_KEY).toBe('ui:theme');
    expect(await loadTheme(store)).toBe('pastel');
  });

  it('"Delete everything" removes it, which resets the look to Sunrise', () => {
    expect(keysToDelete({ 'ui:theme': 'ocean' })).toEqual(['ui:theme']);
  });
});
