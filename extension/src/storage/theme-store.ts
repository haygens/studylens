/**
 * The chosen theme (P13b), a setting stored on this device only.
 *
 * Key (from ./keys.ts): `ui:theme` — `sunrise` | `ocean` | `pastel`. Missing or unknown means the
 * default (Sunrise), so "Delete everything" (which removes the key) resets the look.
 */
import { DEFAULT_THEME, isThemeId, type ThemeId } from '../ui/themes';
import type { KeyValueStore } from './activity-store';
import { STORAGE_KEYS } from './keys';

export const THEME_KEY = STORAGE_KEYS.theme;

export function asTheme(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export async function loadTheme(store: KeyValueStore): Promise<ThemeId> {
  const { [THEME_KEY]: saved } = await store.get([THEME_KEY]);
  return asTheme(saved);
}

export async function saveTheme(store: KeyValueStore, theme: ThemeId): Promise<void> {
  await store.set({ [THEME_KEY]: theme });
}
