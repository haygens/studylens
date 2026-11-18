/**
 * Store screenshots for addons.mozilla.org (docs/store/screenshots/, 1280x800 PNG).
 * Run: `npm run screenshots -w extension` (builds the E2E version first).
 *
 * Why the E2E build: it ignores OS idle (nobody touches the PC while this runs, so the normal
 * build would stop counting time) and allows a short test-length session so the check-in screen
 * appears without waiting 5 minutes. Its only visible difference is the "Test length in seconds"
 * field on the Start form, which is never captured — every capture first checks that no test-only
 * text is on screen. All web requests go to tiny local stub pages; nothing touches the internet.
 */
import { chromium, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = fileURLToPath(new URL('../.output/edge-mv3-e2e', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../docs/store/screenshots/', import.meta.url));
const SITES = {
  'en.wikipedia.org': 'Photosynthesis - Wikipedia',
  'www.khanacademy.org': 'Khan Academy',
  'www.youtube.com': 'YouTube',
  'www.reddit.com': 'Reddit',
};
const TEST_ONLY_TEXT = /E2E|test build|Test length/i;

mkdirSync(OUT_DIR, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'studylens-shots-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: process.env.E2E_CHANNEL ?? 'msedge',
  headless: true,
  args: [
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
  ],
});

try {
  await context.route(/^https?:\/\//, (route) => {
    const title = SITES[new URL(route.request().url()).hostname];
    if (!title) return route.abort('blockedbyclient');
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>${title}</title><h1>${title}</h1>`,
    });
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const base = `chrome-extension://${new URL(sw.url()).host}`;

  /** Saves a 1280x800 screenshot of `page`, after checking no test-only text is visible. */
  async function capture(page, name) {
    await expect(page.getByText(TEST_ONLY_TEXT)).toHaveCount(0);
    await page.screenshot({ path: path.join(OUT_DIR, name) });
    console.log(`✓ docs/store/screenshots/${name}`);
  }

  /** The popup is 300px wide, so show it at 2x, centered on a plain 1280x800 card with a caption. */
  async function capturePopup(popup, name, caption) {
    await expect(popup.getByText(TEST_ONLY_TEXT)).toHaveCount(0);
    const png = await popup.locator('main').screenshot();
    const frame = await context.newPage();
    await frame.setViewportSize({ width: 1280, height: 800 });
    await frame.setContent(`<!doctype html>
      <style>
        body { margin: 0; height: 800px; display: flex; align-items: center; justify-content: center;
               gap: 64px; background: #eef2fb; font-family: system-ui, sans-serif; color: #1f2328; }
        img { height: auto; max-height: 720px; width: 600px; object-fit: contain; object-position: top;
              background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(31, 35, 40, .18); }
        p { font-size: 34px; font-weight: 600; max-width: 420px; line-height: 1.3; margin: 0; }
      </style>
      <p>${caption}</p><img src="data:image/png;base64,${png.toString('base64')}">`);
    await frame.locator('img').evaluate((img) => img.decode());
    await frame.screenshot({ path: path.join(OUT_DIR, name) });
    await frame.close();
    console.log(`✓ docs/store/screenshots/${name}`);
  }

  async function openPopup() {
    const page = await context.newPage();
    await page.setViewportSize({ width: 340, height: 800 });
    await page.goto(`${base}/popup.html`);
    return page;
  }

  // 1. Label sites on the options page.
  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 800 });
  await options.goto(`${base}/options.html`);
  for (const [domain, category] of [
    ['wikipedia.org', 'study'],
    ['khanacademy.org', 'study'],
    ['youtube.com', 'distraction'],
    ['reddit.com', 'distraction'],
  ]) {
    await options.getByLabel('New site', { exact: true }).fill(domain);
    await options.getByLabel('New site category').selectOption(category);
    await options.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(options.getByLabel(`Category for ${domain}`)).toHaveValue(category);
  }

  // Research interventions are on by default from v0.2.0. Keep the screenshots predictable (no
  // notice, no random friction/intention pages) by switching them off in this throwaway profile.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(() =>
    globalThis.chrome.storage.local.set({ 'interventions:enabled': false }),
  );

  // 2. A short session that ends on its own while browsing, for the check-in screen.
  let popup = await openPopup();
  await popup.getByLabel('What will you work on?').fill('Read chapter 4: photosynthesis');
  await popup.getByLabel('Test length in seconds (E2E build only)').fill('75');
  await popup.getByRole('button', { name: 'Start focus session' }).click();
  await expect(popup.getByText('Focusing on')).toBeVisible();
  await popup.close();

  const site = await context.newPage();
  for (const [url, seconds] of [
    ['https://en.wikipedia.org/wiki/Photosynthesis', 30],
    ['https://www.youtube.com/watch?v=1', 8],
    ['https://www.khanacademy.org/science/biology', 25],
    ['https://www.reddit.com/r/biology', 6],
    ['https://en.wikipedia.org/wiki/Chlorophyll', 12],
  ]) {
    await site.bringToFront();
    await site.goto(url);
    await site.waitForTimeout(seconds * 1000);
  }

  popup = await openPopup();
  await expect(popup.getByText('Did you finish your goal?')).toBeVisible({ timeout: 60_000 });
  await popup.getByRole('button', { name: 'Yes' }).click();
  await popup.getByRole('button', { name: '4 – mostly focused' }).click();
  await capturePopup(popup, '2-check-in.png', 'A quick check-in when your session ends');
  await popup.getByRole('button', { name: 'Save' }).click();
  await popup.close();

  // 3. A normal 25-minute session, running.
  popup = await openPopup();
  await popup.getByLabel('What will you work on?').fill('Problem set 3, questions 1–10');
  await popup.getByLabel('25 min').check();
  await popup.getByRole('button', { name: 'Start focus session' }).click();
  await expect(popup.getByText('Focusing on')).toBeVisible();
  await site.bringToFront();
  await site.goto('https://www.khanacademy.org/math');
  await site.waitForTimeout(3_000);
  await popup.reload();
  await expect(popup.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(popup.getByRole('cell', { name: 'khanacademy.org' })).toBeVisible();
  await capturePopup(
    popup,
    '1-focus-session.png',
    'Set a goal, start a focus session, and see where today went',
  );
  await popup.close();

  // 4. Options: site categories, then My Data.
  await options.bringToFront();
  await options.reload();
  await capture(options, '3-site-categories.png');
  await options.goto(`${base}/options.html#my-data`);
  await expect(options.getByRole('heading', { name: 'My Data', level: 1 })).toBeVisible();
  await capture(options, '4-my-data.png');
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
