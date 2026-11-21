/**
 * Starts an extension page (popup, options, helper page, welcome) with the chosen theme (P13b).
 *
 * The theme tokens are added as one <style> element, and the stored theme is applied to <html>
 * before React renders, so the page never flashes the wrong look. If storage is slow, the page
 * renders with the default theme after a short wait and switches when the answer arrives.
 * Changing the theme on any page restyles every open StudyLens page right away.
 */
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { localStore } from '../background/browser-adapter';
import { THEME_KEY, asTheme, loadTheme } from '../storage/theme-store';
import { DEFAULT_THEME, themeCss, type ThemeId } from './themes';
import './styles.css';

const THEME_WAIT_MS = 400;

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
}

function addTokens(): void {
  if (document.getElementById('sl-theme-tokens')) return;
  const style = document.createElement('style');
  style.id = 'sl-theme-tokens';
  style.textContent = themeCss();
  document.head.append(style);
}

export function mountPage(app: ReactNode): void {
  addTokens();
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[THEME_KEY];
    if (area === 'local' && change) applyTheme(asTheme(change.newValue));
  });
  const stored = loadTheme(localStore).then(applyTheme, () => applyTheme(DEFAULT_THEME));
  const wait = new Promise<void>((resolve) => setTimeout(resolve, THEME_WAIT_MS));
  void Promise.race([stored, wait]).then(() => {
    createRoot(document.getElementById('root')!).render(<StrictMode>{app}</StrictMode>);
  });
}
