/**
 * UX review screenshots: every screen at normal size.
 * - Before P13b (v0.2.0): `node extension/scripts/ux-review-shots.mjs` → docs/ux-review/screens/
 * - After P13b, per theme: `node extension/scripts/ux-review-shots.mjs sunrise` (or ocean, pastel)
 *   → docs/ux-review/after/<theme>/. The run picks that theme first, like a user would.
 * Build first: `npm run build:e2e -w extension`.
 *
 * Same setup as screenshots.mjs: the E2E build in installed Edge (headless), a throwaway profile
 * in TEMP (on M:), local stub pages only, nothing touches the internet. The popup is captured at
 * its real size (1x). The E2E build adds one test-only field ("Test length in seconds") to the
 * Start form; it is hidden with CSS before every popup capture so the pictures match the real build.
 */
import { chromium, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = fileURLToPath(new URL('../.output/edge-mv3-e2e', import.meta.url));
const THEME = process.argv[2];
if (THEME && !['sunrise', 'ocean', 'pastel'].includes(THEME)) {
  throw new Error(`Unknown theme "${THEME}". Use sunrise, ocean or pastel.`);
}
const REL_DIR = THEME ? `docs/ux-review/after/${THEME}` : 'docs/ux-review/screens';
const OUT_DIR = fileURLToPath(new URL(`../../${REL_DIR}/`, import.meta.url));
const SITES = {
  'en.wikipedia.org': 'Wikipedia',
  'www.khanacademy.org': 'Khan Academy',
  'www.youtube.com': 'YouTube',
  'www.reddit.com': 'Reddit',
  'docs.google.com': 'Google Docs',
};
const MIN = 60_000;
const ACTIVE_KEY = 'sessions:active';
const HIDE_TEST_FIELD = '[data-testid] { display: none !important; }';

function sampleHistory() {
  const at = (daysAgo, hour) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const plan = [
    [12, 9, 'control', 4, 9, 3, 'partly'],
    [11, 15, 'friction', 1, 3, 4, 'yes'],
    [10, 20, 'intention', 2, 4, 4, 'yes'],
    [9, 10, 'friction', 2, 5, 3, 'partly'],
    [8, 14, 'control', 3, 8, 3, 'no'],
    [7, 9, 'intention', 1, 2, 5, 'yes'],
    [6, 16, 'control', 5, 11, 2, 'partly'],
    [5, 10, 'friction', 1, 2, 4, 'yes'],
    [4, 19, 'intention', 2, 3, 4, 'partly'],
    [3, 9, 'control', 2, 6, 4, 'yes'],
    [2, 11, 'friction', 0, 1, 5, 'yes'],
    [1, 21, 'intention', 1, 2, 3, 'yes'],
  ];
  return plan.map(([days, hour, condition, visits, distraction, rating, goal], i) => {
    const start = at(days, hour);
    return {
      id: `sample-${i}`,
      goal: 'Sample study session',
      plannedMinutes: 50,
      start,
      plannedEnd: start + 50 * MIN,
      actualEnd: start + 50 * MIN,
      endedEarly: false,
      condition,
      minutesByCategory: { study: 50 - distraction - 3, neutral: 3, distraction },
      distractionVisits: visits,
      checkIn: { goalCompleted: goal, focusRating: rating, answeredAt: start + 51 * MIN },
      frictionShown: 0,
      frictionContinued: 0,
      frictionTurnedBack: 0,
      intentionShown: 0,
      intentionContinued: 0,
      intentionTurnedBack: 0,
    };
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'studylens-ux-'));
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
  const storage = (items) => sw.evaluate((i) => globalThis.chrome.storage.local.set(i), items);
  const site = await context.newPage();
  await site.setViewportSize({ width: 1280, height: 800 });

  async function shot(page, name, options = {}) {
    await page.screenshot({ path: path.join(OUT_DIR, name), ...options });
    console.log(`✓ ${REL_DIR}/${name}`);
  }

  /** The popup at its real size: the page cropped to the popup's own box. */
  async function popupShot(popup, name) {
    await popup.addStyleTag({ content: HIDE_TEST_FIELD });
    await popup.locator('main').screenshot({ path: path.join(OUT_DIR, name) });
    console.log(`✓ ${REL_DIR}/${name}`);
  }

  async function openPopup() {
    const page = await context.newPage();
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(`${base}/popup.html`);
    return page;
  }

  async function startSession(goal, { minutes = 25, seconds } = {}) {
    const popup = await openPopup();
    await popup.getByLabel('What will you work on?').fill(goal);
    if (seconds) {
      await popup.getByLabel('Test length in seconds (E2E build only)').fill(String(seconds));
    } else {
      await popup.getByLabel(`${minutes} min`).check();
    }
    await popup.getByRole('button', { name: 'Start focus session' }).click();
    await expect(popup.getByText('Focusing on')).toBeVisible();
    return popup;
  }

  async function endAndSkip() {
    const popup = await openPopup();
    await popup.getByRole('button', { name: 'End early' }).click();
    await popup.getByRole('button', { name: 'Skip' }).click();
    await expect(popup.getByRole('button', { name: 'Start focus session' })).toBeVisible();
    await popup.close();
  }

  async function browse(visits) {
    for (const [url, seconds] of visits) {
      await site.bringToFront();
      await site.goto(url);
      await site.waitForTimeout(seconds * 1000);
    }
  }

  // --- Welcome page (P13b): opens by itself on install. -------------------------------------------
  const isWelcome = (page) => page.url().includes('/welcome.html');
  await expect.poll(() => context.pages().some(isWelcome), { timeout: 15_000 }).toBe(true);
  const welcome = context.pages().find(isWelcome);
  if (THEME) {
    await welcome.setViewportSize({ width: 1280, height: 800 });
    await welcome.getByRole('radio', { name: new RegExp(THEME, 'i') }).check();
    await expect(welcome.locator('html')).toHaveAttribute('data-theme', THEME);
    await shot(welcome, 'welcome-01-look.png', { fullPage: true });
    await welcome.getByRole('button', { name: 'Next' }).click();
    await shot(welcome, 'welcome-02-sites.png', { fullPage: true });
    await welcome.getByRole('button', { name: 'Skip' }).click();
    await shot(welcome, 'welcome-03-helpers.png', { fullPage: true });
  }
  // Closed before answering, so the popup shows the research notice ("fresh install").
  await welcome.close();

  // --- First run: nothing labeled, research notice unanswered. ---------------------------------
  let popup = await openPopup();
  await expect(popup.getByRole('dialog', { name: 'Research interventions' })).toBeVisible();
  await popupShot(popup, 'popup-01-fresh-install.png');
  await popup
    .getByRole('dialog', { name: 'Research interventions' })
    .screenshot({ path: path.join(OUT_DIR, 'popup-02-research-notice.png') });
  console.log(`✓ ${REL_DIR}/popup-02-research-notice.png`);
  await popup.close();

  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 800 });
  await options.goto(`${base}/options.html`);
  await expect(options.getByRole('heading', { name: 'Site categories', level: 1 })).toBeVisible();
  await shot(options, 'options-01-site-categories-empty.png', { fullPage: true });
  await options.goto(`${base}/options.html#insights`);
  await expect(options.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible();
  await shot(options, 'options-03-insights-empty.png', { fullPage: true });

  // Answer the notice ("Keep on") from the popup, like a real user.
  popup = await openPopup();
  await popup.getByRole('button', { name: 'Keep on' }).click();
  await popup.close();

  // Label a few sites, browse a little.
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
  await browse([
    ['https://en.wikipedia.org/wiki/Photosynthesis', 6],
    ['https://docs.google.com/document/d/1', 4],
    ['https://www.youtube.com/watch?v=1', 3],
  ]);

  // --- Check-in: a short control session that ends on its own. ---------------------------------
  await storage({ 'interventions:block': ['control'] });
  popup = await startSession('Read chapter 4: photosynthesis', { seconds: 20 });
  await popup.close();
  await browse([
    ['https://www.khanacademy.org/science/biology', 12],
    ['https://www.reddit.com/r/biology', 4],
    ['https://en.wikipedia.org/wiki/Chlorophyll', 8],
  ]);
  popup = await openPopup();
  await expect(popup.getByText('Did you finish your goal?')).toBeVisible({ timeout: 60_000 });
  await popup.waitForTimeout(800); // let the session-complete card finish fading in
  await popupShot(popup, 'popup-05-check-in.png');
  await popup.getByRole('button', { name: 'Yes' }).click();
  await popup.getByRole('button', { name: '4 – mostly focused' }).click();
  await popupShot(popup, 'popup-05b-check-in-answered.png');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup.getByRole('button', { name: 'Start focus session' })).toBeVisible();
  await popup.close();

  // --- Idle (after a session, with today's sites). ---------------------------------------------
  await site.bringToFront();
  await site.goto('https://en.wikipedia.org/wiki/Plant');
  popup = await openPopup();
  await expect(popup.getByRole('button', { name: 'Start focus session' })).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'Today' })).toBeVisible();
  await popupShot(popup, 'popup-03-idle.png');
  await popup.close();

  // --- Running session. -------------------------------------------------------------------------
  popup = await startSession('Problem set 3, questions 1–10');
  await site.bringToFront();
  await site.goto('https://www.khanacademy.org/math');
  await site.waitForTimeout(2_500);
  await popup.reload();
  await expect(popup.getByText('Focusing on')).toBeVisible();
  await popupShot(popup, 'popup-04-running.png');

  // --- Paused (during the running session). -----------------------------------------------------
  await popup.getByRole('button', { name: 'Pause tracking' }).click();
  await expect(popup.getByText('Tracking paused').first()).toBeVisible();
  await popupShot(popup, 'popup-06-paused.png');
  await popup.getByRole('button', { name: 'Resume tracking' }).click();
  await popup.close();
  await endAndSkip();

  // --- Friction interstitial. -------------------------------------------------------------------
  await storage({ 'interventions:block': ['friction'] });
  (await startSession('Problem set 3, questions 1–10')).close();
  await site.bringToFront();
  await site.goto('https://www.khanacademy.org/math');
  await site.goto('https://www.youtube.com/watch?v=2').catch(() => undefined);
  await expect(site.getByRole('heading', { name: 'A moment before youtube.com' })).toBeVisible();
  await site.waitForTimeout(3_000);
  await shot(site, 'interstitial-01-friction-countdown.png');
  await expect(site.getByRole('button', { name: 'Continue to youtube.com' })).toBeVisible({
    timeout: 15_000,
  });
  await shot(site, 'interstitial-02-friction-done.png');
  await endAndSkip();

  // --- Intention interstitial. ------------------------------------------------------------------
  await storage({ 'interventions:block': ['intention'] });
  (await startSession('Essay outline for history')).close();
  await site.bringToFront();
  await site.goto('https://en.wikipedia.org/wiki/Renaissance');
  await site.goto('https://www.reddit.com/r/history').catch(() => undefined);
  await expect(site.getByRole('heading', { name: 'Before you open reddit.com' })).toBeVisible();
  await shot(site, 'interstitial-03-intention-empty.png');
  await site.getByLabel('What did you come here for?').fill('Check one source for my essay');
  await shot(site, 'interstitial-04-intention-typed.png');
  await site.getByLabel('What did you come here for?').fill('');
  // "Back to studying" normally returns to the previous page; with no earlier page it shows this.
  const { [ACTIVE_KEY]: active } = await sw.evaluate(
    (k) => globalThis.chrome.storage.local.get(k),
    ACTIVE_KEY,
  );
  await site.goto(`${base}/interstitial.html?done=1&s=${encodeURIComponent(active.id)}`);
  await expect(site.getByRole('heading', { name: 'Back to studying' })).toBeVisible();
  await shot(site, 'interstitial-05-back-to-studying.png');
  await endAndSkip();

  // --- Options tabs with data. ------------------------------------------------------------------
  await storage({ 'sessions:history': sampleHistory() });
  await options.bringToFront();
  await options.goto(`${base}/options.html`);
  await options.reload();
  await expect(options.getByLabel('Category for youtube.com')).toBeVisible();
  await shot(options, 'options-02-site-categories.png', { fullPage: true });
  await options.goto(`${base}/options.html#insights`);
  await expect(options.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible();
  await options.waitForTimeout(500);
  await shot(options, 'options-04-insights-sample.png', { fullPage: true });
  await options.goto(`${base}/options.html#settings`);
  await expect(options.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await shot(options, 'options-05-settings.png', { fullPage: true });
  await options.goto(`${base}/options.html#my-data`);
  await expect(options.getByRole('heading', { name: 'My Data', level: 1 })).toBeVisible();
  await options.evaluate(() => globalThis.scrollTo(0, 0));
  await shot(options, 'options-06-my-data.png', { fullPage: true });

  // The welcome page's last screen (the research question was answered in the popup).
  if (THEME) {
    const again = await context.newPage();
    await again.setViewportSize({ width: 1280, height: 800 });
    await again.goto(`${base}/welcome.html`);
    await again.getByRole('button', { name: 'Next' }).click();
    await again.getByRole('button', { name: 'Skip' }).click();
    await again.getByRole('button', { name: 'Finish' }).click();
    await expect(again.getByRole('heading', { name: 'You’re all set!' })).toBeVisible();
    await shot(again, 'welcome-04-done.png', { fullPage: true });
    await again.close();
  }

  // Keyboard focus check: Tab through the popup and record what has a visible focus ring.
  popup = await openPopup();
  await popup.keyboard.press('Tab');
  await popupShot(popup, 'popup-07-keyboard-focus.png');
  await popup.close();
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
