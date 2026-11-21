/** React hook for the chosen theme (P13b): follows changes made on any StudyLens page. */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '../background/browser-adapter';
import { THEME_KEY, asTheme, loadTheme, saveTheme } from '../storage/theme-store';
import type { ThemeId } from './themes';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void loadTheme(localStore).then(setThemeState, () => setThemeState(asTheme(undefined)));
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const change = changes[THEME_KEY];
      if (area === 'local' && change) setThemeState(asTheme(change.newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    setSaveError(null);
    // The page restyles itself when storage changes (see page.tsx).
    saveTheme(localStore, next).catch((err: unknown) => {
      console.error('[StudyLens] could not save the theme', err);
      setSaveError('Could not save the theme. Try again.');
    });
  }, []);

  return { theme, setTheme, saveError };
}
