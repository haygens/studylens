/**
 * Store screenshots for addons.mozilla.org and Edge Add-ons (docs/store/screenshots/, 1280x800
 * PNG), plus the Edge store logo (300x300) and small promo tile (440x280) in docs/store/edge/.
 * Run: `npm run screenshots -w extension` (builds the E2E version first).
 *
 * Why the E2E build: it ignores OS idle (nobody touches the PC while this runs, so the normal
 * build would stop counting time) and allows a short test-length session so the check-in screen
 * appears without waiting 5 minutes. Its only visible difference is the "Test length in seconds"
 * field on the Start form, which is never captured — every capture first checks that no test-only
 * text is on screen. All web requests go to tiny local stub pages; nothing touches the internet.
 *
 * The Insights screenshot needs a few weeks of history, so this throwaway profile gets sample
 * sessions and activity (made up for the picture, clearly not research results).
 */
import { chromium, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = fileURLToPath(new URL('../.output/edge-mv3-e2e', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../docs/store/screenshots/', import.meta.url));
const EDGE_DIR = fileURLToPath(new URL('../../docs/store/edge/', import.meta.url));
const ICON_SVG = readFileSync(fileURLToPath(new URL('../assets/icon.svg', import.meta.url)));
const SITES = {
  'en.wikipedia.org': 'Photosynthesis - Wikipedia',
  'www.khanacademy.org': 'Khan Academy',
  'www.youtube.com': 'YouTube',
  'www.reddit.com': 'Reddit',
};
const TEST_ONLY_TEXT = /E2E|test build|Test length/i;
const MIN = 60_000;

/** Sample history for the Insights picture: 3+ sessions per condition over the last 12 days. */
function sampleData() {
  const at = (daysAgo, hour) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const plan = [
    // [days ago, hour, condition, visits, distraction min, rating, goal]
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
  const history = plan.map(([days, hour, condition, visits, distraction, rating, goal], i) => {
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
  const activity = {};
  for (const s of history) {
    const d = new Date(s.start);
    const key = `activity:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const study = s.minutesByCategory.study * MIN;
    const distraction = s.minutesByCategory.distraction * MIN;
    activity[key] = [
      { hostname: 'en.wikipedia.org', start: s.start, end: s.start + study / 2 },
      {
        hostname: 'www.youtube.com',
        start: s.start + study / 2,
        end: s.start + study / 2 + distraction,
      },
      {
        hostname: 'www.khanacademy.org',
        start: s.start + study / 2 + distraction,
        end: s.start + study + distraction,
      },
    ];
  }
  return { 'sessions:history': history, ...activity };
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(EDGE_DIR, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'studylens-shots-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: process.env.E2E_CHANNEL ?? 'msedge',
  headless: true,
  reducedMotion: 'reduce', // P21: still frames, no half-faded screenshots
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
  // A new install opens the welcome page (P13b). Close it so it can't take focus, and use the
  // default Sunrise theme for every store picture.
  const isWelcome = (page) => page.url().includes('/welcome.html');
  await expect.poll(() => context.pages().some(isWelcome), { timeout: 15_000 }).toBe(true);
  await context.pages().find(isWelcome).close();
  const storage = (items) => sw.evaluate((i) => globalThis.chrome.storage.local.set(i), items);

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
               gap: 64px; background: linear-gradient(160deg, #fff7ed, #fdf2f8 55%, #eef2ff);
               font-family: system-ui, sans-serif; color: #1e1b3a; }
        img { height: 720px; width: auto; max-width: 600px; object-fit: contain; object-position: top;
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

  /** Starts a session from the popup; `seconds` uses the E2E-only test length (never captured). */
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

  /** "End early", then Skip the check-in, so the next session can start. */
  async function endAndSkip() {
    const popup = await openPopup();
    await popup.getByRole('button', { name: 'End early' }).click();
    await popup.getByRole('button', { name: 'Skip' }).click();
    await expect(popup.getByRole('button', { name: 'Start focus session' })).toBeVisible();
    await popup.close();
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

  // Sample history for Insights. Research interventions are on (notice answered); the condition of
  // each session is chosen by writing the shuffled block (as the E2E tests do), so the check-in and
  // running sessions are `control` (no helper page) and the helper screenshots are predictable.
  await storage({
    ...sampleData(),
    'interventions:enabled': true,
    'interventions:notice-seen': true,
    'onboarding:welcome': 'done', // set up already: no "Finish setting up" hint in the pictures
    'interventions:block': ['control'],
  });

  // 2. A short session that ends on its own while browsing, for the check-in screen.
  let popup = await startSession('Read chapter 4: photosynthesis', { seconds: 75 });
  await popup.close();
  const site = await context.newPage();
  await site.setViewportSize({ width: 1280, height: 800 });
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
  await popup.waitForTimeout(800); // let the session-complete card finish fading in
  await capturePopup(popup, '6-check-in.png', 'A quick check-in when your session ends');
  await popup.getByRole('button', { name: 'Save' }).click();
  await popup.close();

  // 3. Friction: a countdown before a Distraction site.
  await storage({ 'interventions:block': ['friction'] });
  (await startSession('Problem set 3, questions 1–10')).close();
  await site.bringToFront();
  await site.goto('https://www.khanacademy.org/math');
  await site.goto('https://www.youtube.com/watch?v=2').catch(() => undefined); // redirected
  await expect(site.getByRole('heading', { name: 'A moment before youtube.com' })).toBeVisible();
  await site.waitForTimeout(3_500); // let the countdown visibly run
  await capture(site, '2-friction-countdown.png');
  await endAndSkip();

  // 4. Intention: "What did you come here for?" before a Distraction site.
  await storage({ 'interventions:block': ['intention'] });
  (await startSession('Essay outline for history')).close();
  await site.bringToFront();
  await site.goto('https://en.wikipedia.org/wiki/Renaissance');
  await site.goto('https://www.reddit.com/r/history').catch(() => undefined); // redirected
  await expect(site.getByRole('heading', { name: 'Before you open reddit.com' })).toBeVisible();
  await site.getByLabel('What did you come here for?').fill('Check one source for my essay');
  await capture(site, '3-intention-question.png');
  await site.getByLabel('What did you come here for?').fill(''); // never stored either way
  await endAndSkip();

  // 5. A normal 25-minute session, running (control: no helper page).
  await storage({ 'interventions:block': ['control'] });
  popup = await startSession('Problem set 3, questions 1–10');
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

  // 6. Options: Insights, My Data, site categories.
  await options.bringToFront();
  await options.goto(`${base}/options.html#insights`);
  await expect(options.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible();
  // Start the picture at the "Best time of day" card, so the comparison table fits below it.
  await options
    .getByRole('region', { name: 'Best time of day' })
    .evaluate((el) =>
      globalThis.scrollTo(0, el.getBoundingClientRect().top + globalThis.scrollY - 24),
    );
  await capture(options, '4-insights.png');
  await options.goto(`${base}/options.html#my-data`);
  await expect(options.getByRole('heading', { name: 'My Data', level: 1 })).toBeVisible();
  await options.evaluate(() => globalThis.scrollTo(0, 0)); // a hash change keeps the scroll
  await capture(options, '5-my-data.png');
  await options.goto(`${base}/options.html`);
  await options.reload();
  await capture(options, '7-site-categories.png');

  // 7. Edge Add-ons images: store logo (300x300) and small promo tile (440x280).
  const art = await context.newPage();
  const iconSrc = `data:image/svg+xml;base64,${ICON_SVG.toString('base64')}`;
  await art.setViewportSize({ width: 300, height: 300 });
  await art.setContent(
    `<style>html,body{margin:0;background:transparent}</style>` +
      `<img src="${iconSrc}" width="300" height="300" style="display:block">`,
  );
  await art.locator('img').evaluate((img) => img.decode());
  await art.screenshot({
    path: path.join(EDGE_DIR, 'store-logo-300x300.png'),
    omitBackground: true,
  });
  console.log('✓ docs/store/edge/store-logo-300x300.png');
  await art.setViewportSize({ width: 440, height: 280 });
  await art.setContent(`<!doctype html>
    <style>
      body { margin: 0; width: 440px; height: 280px; display: flex; align-items: center; gap: 24px;
             padding: 0 32px; box-sizing: border-box;
             background: linear-gradient(160deg, #fff7ed, #fdf2f8 55%, #eef2ff);
             font-family: system-ui, sans-serif; color: #1e1b3a; }
      h1 { font-size: 40px; margin: 0 0 8px; }
      p { font-size: 18px; line-height: 1.3; margin: 0; color: #5b5675; }
    </style>
    <img src="${iconSrc}" width="112" height="112">
    <div><h1>StudyLens</h1><p>Focus sessions for students. Your data stays on your device.</p></div>`);
  await art.locator('img').evaluate((img) => img.decode());
  await art.screenshot({ path: path.join(EDGE_DIR, 'small-promo-tile-440x280.png') });
  console.log('✓ docs/store/edge/small-promo-tile-440x280.png');
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
