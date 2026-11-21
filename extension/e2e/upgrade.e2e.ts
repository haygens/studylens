/**
 * Upgrade from 0.2.0 (P13b): no welcome page, only a small "New: themes!" hint in the popup
 * that links to Settings and goes away once used.
 *
 * Playwright can't install an older add-on and then update it, so this simulates the update on
 * a copy of the E2E build: the copy starts out claiming version 0.2.0 (with 0.2.0-style storage:
 * notice answered, a label, no theme), then its manifest is changed to 0.3.0 and the extension
 * reloads itself, which fires `runtime.onInstalled` with reason "update" and previousVersion
 * "0.2.0", exactly like a store update.
 */
import { chromium, type BrowserContext } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, findWelcomePage, test } from './fixtures';

const BUILD = fileURLToPath(new URL('../.output/edge-mv3-e2e', import.meta.url));

interface Chrome {
  chrome: {
    runtime: { reload(): void; getManifest(): { version: string } };
    storage: {
      local: {
        get(keys: null): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
        clear(): Promise<void>;
      };
    };
  };
}

function setVersion(dir: string, version: string) {
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { version: string };
  manifest.version = version;
  writeFileSync(file, JSON.stringify(manifest));
}

const CHANNEL = process.env.E2E_CHANNEL ?? (process.env.CI ? 'chromium' : 'msedge');

// Playwright's Chromium (used in CI) doesn't bring an unpacked extension back after
// runtime.reload(), so the update can only be simulated in Edge, where it is run locally
// (`npm run test:e2e`). The install/update rules themselves are unit-tested in
// src/onboarding/onboarding.test.ts, in CI too.
test.skip(CHANNEL !== 'msedge', 'needs Edge: Chromium does not reload unpacked extensions');

test('update from 0.2.0: no welcome page, a "New: themes!" hint that links to Settings', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'studylens-upgrade-'));
  const ext = path.join(root, 'ext');
  cpSync(BUILD, ext, { recursive: true });
  setVersion(ext, '0.2.0');
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
      channel: CHANNEL,
      headless: true,
      args: [
        `--disable-extensions-except=${ext}`,
        `--load-extension=${ext}`,
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
      ],
    });
    await context.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const first = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(first.url()).host;

    // "Version 0.2.0" was installed some time ago: the user has used it, no theme exists.
    await (await findWelcomePage(context)).close();
    await first.evaluate(() => (globalThis as unknown as Chrome).chrome.storage.local.clear());
    await first.evaluate(
      (items) => (globalThis as unknown as Chrome).chrome.storage.local.set(items),
      {
        'interventions:notice-seen': true,
        'categories:rules': [{ domain: 'youtube.com', category: 'distraction' }],
      },
    );

    // The store delivers 0.3.0.
    setVersion(ext, '0.3.0');
    await first
      .evaluate(() => (globalThis as unknown as Chrome).chrome.runtime.reload())
      .catch(() => undefined);
    // Read the reloaded extension through one of its own pages (Playwright doesn't always list the
    // new service worker after a reload in Chromium). Extension pages have the same APIs.
    const probe = await context.newPage();
    const fromPage = <T>(fn: () => T | Promise<T>) => probe.evaluate(fn).catch(() => null);
    const storage = () =>
      fromPage(() => (globalThis as unknown as Chrome).chrome.storage.local.get(null));
    await expect
      .poll(
        async () => {
          await probe.goto(`chrome-extension://${id}/popup.html`).catch(() => undefined);
          return fromPage(
            () => (globalThis as unknown as Chrome).chrome.runtime.getManifest().version,
          );
        },
        { timeout: 30_000, message: 'reloaded extension at 0.3.0' },
      )
      .toBe('0.3.0');
    await expect
      .poll(storage)
      .toMatchObject({ 'onboarding:themes-hint': true, 'interventions:notice-seen': true });

    // No welcome page for existing users (give it a moment to be sure).
    await new Promise((r) => setTimeout(r, 2000));
    expect(context.pages().filter((p) => p.url().includes('/welcome.html'))).toHaveLength(0);
    expect((await storage())?.['onboarding:welcome']).toBeUndefined();

    // The popup: the hint, no research notice, the default theme, and a working Start form.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.locator('html')).toHaveAttribute('data-theme', 'sunrise');
    const hint = popup.getByRole('region', { name: "What's new" });
    await expect(hint.getByText('New: themes!')).toBeVisible();
    await expect(popup.getByRole('dialog', { name: 'Research interventions' })).toHaveCount(0);
    await expect(popup.getByText('Finish setting up StudyLens')).toHaveCount(0);

    // "Choose a theme" opens the Settings tab, and the hint is gone for good.
    const [settings] = await Promise.all([
      context.waitForEvent('page'),
      hint.getByRole('button', { name: 'Choose a theme' }).click(),
    ]);
    await expect(settings).toHaveURL(/options\.html#settings$/);
    await expect(settings.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    await expect.poll(storage).toMatchObject({ 'onboarding:themes-hint': false });
    const again = await context.newPage();
    await again.goto(`chrome-extension://${id}/popup.html`);
    await expect(again.getByRole('button', { name: 'Start focus session' })).toBeVisible();
    await expect(again.getByText('New: themes!')).toHaveCount(0);
  } finally {
    await context?.close();
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
