/**
 * e. The popup never renders blank: while storage is slow it shows "Loading...", and if storage
 * never answers it shows an error with Retry (the P4 blank-popup bug).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

type StorageGet = (...args: unknown[]) => Promise<unknown>;
interface PageChrome {
  chrome: { storage: { local: { get: StorageGet } } };
}

/** Replaces `chrome.storage.local.get` in the popup before its scripts run. */
function patchStorage(mode: 'slow' | 'hang') {
  return (page: Page) =>
    page.addInitScript((m) => {
      const area = (globalThis as unknown as PageChrome).chrome.storage.local;
      const original = area.get.bind(area);
      area.get = (...args) =>
        m === 'hang'
          ? new Promise(() => undefined)
          : new Promise((resolve) => setTimeout(() => resolve(original(...args)), 2_000));
    }, mode);
}

test('e1. shows the Start form and the "Today" section normally', async ({ openPopup }) => {
  const popup = await openPopup();
  await expect(popup.getByRole('button', { name: 'Start focus session' })).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(popup.getByText('Nothing tracked today.')).toBeVisible();
  // Public release: no leftover developer wording.
  await expect(popup.getByText(/debug|temporary|\bP\d+\b/i)).toHaveCount(0);
});

test('e2. shows "Loading..." while storage is slow, then the Start form', async ({ openPopup }) => {
  const popup = await openPopup(patchStorage('slow'));
  await expect(popup.getByText('Loading...').first()).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Start focus session' })).toBeVisible();
  await expect(popup.getByText('Loading...')).toHaveCount(0);
});

test('e3. shows an error with Retry when storage never answers', async ({ openPopup }) => {
  const popup = await openPopup(patchStorage('hang'));
  await expect(popup.getByText('Loading...').first()).toBeVisible();
  await expect(popup.getByText('Focus session could not load.')).toBeVisible();
  await expect(popup.getByText(/Timed out/).first()).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Retry' }).first()).toBeVisible();
});
