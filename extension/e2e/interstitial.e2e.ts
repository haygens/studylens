/**
 * End-to-end: the friction (P9) and intention (P10) interventions, which share one interstitial
 * page. Research interventions are turned on for each test, and the session's condition is chosen
 * by writing the shuffled block before the session starts.
 */
import type { BrowserContext, Page } from '@playwright/test';
import type { InterventionId } from '@studylens/shared';
import type { ActiveSession } from '../src/sessions/session';
import {
  enableInterventions,
  expect,
  labelSites,
  startSession,
  stopBackground,
  test,
  type Background,
} from './fixtures';

const WIKI = 'https://en.wikipedia.org/wiki/Focus';
const YOUTUBE = 'https://www.youtube.com/watch?v=SECRET123';
const FRICTION_PAGE = /\/interstitial\.html\?m=friction&/;
const INTENTION_PAGE = /\/interstitial\.html\?m=intention&/;
const GOAL = 'Finish lab report';
const QUESTION = 'What did you come here for?';

interface Setup {
  context: BrowserContext;
  background: Background;
  openOptions: () => Promise<Page>;
  openPopup: () => Promise<Page>;
}

/** Labels the sites, starts a session with `condition`, and opens Wikipedia in a new tab. */
async function setup(
  { context, background, openOptions, openPopup }: Setup,
  condition: InterventionId,
): Promise<Page> {
  await labelSites(openOptions);
  await enableInterventions(background);
  await background.set({ 'interventions:notice-seen': true, 'interventions:block': [condition] });
  const popup = await openPopup();
  await startSession(popup, GOAL, 600);
  expect((await background.get<ActiveSession>('sessions:active')).condition).toBe(condition);
  const site = await context.newPage();
  await site.bringToFront();
  await site.goto(WIKI);
  return site;
}

/** Navigates; the extension may redirect the tab mid-navigation, which aborts `goto`. */
async function visit(site: Page, url: string): Promise<void> {
  await site.goto(url).catch(() => undefined);
}

const frictionCounts = async (background: Background) => {
  const s = await background.get<ActiveSession>('sessions:active');
  return [s.frictionShown, s.frictionContinued, s.frictionTurnedBack];
};
const intentionCounts = async (background: Background) => {
  const s = await background.get<ActiveSession>('sessions:active');
  return [s.intentionShown, s.intentionContinued, s.intentionTurnedBack];
};

/** Waits a moment and checks the tab was NOT sent to the interstitial page. */
async function expectNoInterstitial(site: Page, url: RegExp): Promise<void> {
  await site.waitForTimeout(1500);
  await expect(site).toHaveURL(url);
}

// --- Friction ----------------------------------------------------------------------------------

test('friction: countdown before a Distraction site, Continue after it, then a grace period', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'friction');

  await visit(site, YOUTUBE);
  await expect(site).toHaveURL(FRICTION_PAGE);
  await expect(site.getByRole('heading', { name: 'A moment before youtube.com' })).toBeVisible();
  await expect(site.getByText(GOAL)).toBeVisible();
  await expect(site.getByLabel(QUESTION)).toHaveCount(0); // Not the intention page.
  await expect(site.getByRole('button', { name: 'Back to studying' })).toBeEnabled();
  const continueButton = site.getByRole('button', { name: 'Continue to youtube.com' });
  await expect(continueButton).toHaveCount(0);
  expect(await frictionCounts(background)).toEqual([1, 0, 0]);

  // Stop the background service worker during the countdown: Continue must still work.
  await stopBackground(context, site);
  await expect(continueButton).toBeVisible({ timeout: 15_000 });
  await continueButton.click();
  await expect(site).toHaveURL(YOUTUBE);
  await expect.poll(() => frictionCounts(background)).toEqual([1, 1, 0]);

  // Grace period: leaving and coming back within 5 minutes shows no second countdown.
  await site.goto(WIKI);
  await visit(site, YOUTUBE);
  await expectNoInterstitial(site, /youtube\.com\/watch/);
  expect(await frictionCounts(background)).toEqual([1, 1, 0]);
  expect(await intentionCounts(background)).toEqual([0, 0, 0]);

  // Privacy: the full address never reaches storage.
  expect(JSON.stringify(await background.storage())).not.toMatch(/SECRET123|watch|https?:/);
});

test('friction: "Back to studying" returns to the study page and is counted', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'friction');
  await visit(site, YOUTUBE);
  await expect(site).toHaveURL(FRICTION_PAGE);
  await site.getByRole('button', { name: 'Back to studying' }).click();
  await expect(site).toHaveURL(WIKI);
  await expect.poll(() => frictionCounts(background)).toEqual([1, 0, 1]);
  // Going back did not show the countdown a second time.
  await expectNoInterstitial(site, /wikipedia\.org/);
  expect(await frictionCounts(background)).toEqual([1, 0, 1]);
});

test('no interstitial in control sessions (Study or Distraction sites)', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  // Study site (setup already opened Wikipedia).
  const site = await setup({ context, background, openOptions, openPopup }, 'control');
  await expectNoInterstitial(site, /wikipedia\.org/);

  // Distraction site in a control session.
  await visit(site, YOUTUBE);
  await expectNoInterstitial(site, /youtube\.com\/watch/);
  expect(await frictionCounts(background)).toEqual([0, 0, 0]);
  expect(await intentionCounts(background)).toEqual([0, 0, 0]);
});

test('friction: a Study site in a friction session gets no countdown', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'friction');
  await site.goto('https://en.wikipedia.org/wiki/Study');
  await expectNoInterstitial(site, /wikipedia\.org/);
  expect(await frictionCounts(background)).toEqual([0, 0, 0]);
});

test('friction: switching into a tab already on a Distraction site shows the countdown', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  await labelSites(openOptions);
  await enableInterventions(background);
  await background.set({ 'interventions:notice-seen': true, 'interventions:block': ['friction'] });
  // Opened before the session: no countdown yet.
  const tab = await context.newPage();
  await tab.goto(YOUTUBE);
  const popup = await openPopup();
  await startSession(popup, GOAL, 600);

  await tab.bringToFront();
  await expect(tab).toHaveURL(FRICTION_PAGE);
  expect(await frictionCounts(background)).toEqual([1, 0, 0]);
});

// --- Intention ---------------------------------------------------------------------------------

/** A string that appears nowhere else, to search storage for. */
const TYPED = 'my-very-private-answer-TYPED-XYZ';

test('intention: prompt before a Distraction site; Continue needs 3 characters; grace period; nothing typed is stored', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'intention');

  await visit(site, YOUTUBE);
  await expect(site).toHaveURL(INTENTION_PAGE);
  await expect(site.getByRole('heading', { name: 'Before you open youtube.com' })).toBeVisible();
  await expect(site.getByText(GOAL)).toBeVisible();
  await expect(site.getByRole('timer')).toHaveCount(0); // No countdown.
  await expect(site.getByRole('button', { name: 'Back to studying' })).toBeEnabled();
  expect(await intentionCounts(background)).toEqual([1, 0, 0]);
  expect(await frictionCounts(background)).toEqual([0, 0, 0]);

  // Continue stays disabled until at least 3 non-space characters are typed.
  const box = site.getByLabel(QUESTION);
  const continueButton = site.getByRole('button', { name: 'Continue to youtube.com' });
  await expect(box).toBeFocused();
  await expect(continueButton).toBeDisabled();
  for (const text of ['a', 'ab', '   ', ' a  b ']) {
    await box.fill(text);
    await expect(continueButton).toBeDisabled();
  }
  await box.fill('a b c');
  await expect(continueButton).toBeEnabled();
  await box.fill('ab');
  await expect(continueButton).toBeDisabled();
  await box.fill(TYPED);
  await expect(continueButton).toBeEnabled();
  // While the page is open, the answer is not in storage either.
  expect(JSON.stringify(await background.storage())).not.toContain('TYPED');

  // Stop the background while the prompt is open: Continue must still work.
  await stopBackground(context, site);
  await continueButton.click();
  await expect(site).toHaveURL(YOUTUBE);
  await expect.poll(() => intentionCounts(background)).toEqual([1, 1, 0]);

  // Grace period: leaving and coming back within 5 minutes shows no second prompt.
  await site.goto(WIKI);
  await visit(site, YOUTUBE);
  await expectNoInterstitial(site, /youtube\.com\/watch/);
  expect(await intentionCounts(background)).toEqual([1, 1, 0]);

  // Privacy: neither the typed answer nor the full address ever reached storage.
  const dump = JSON.stringify(await background.storage());
  expect(dump).not.toContain('TYPED');
  expect(dump).not.toContain('private-answer');
  expect(dump).not.toMatch(/SECRET123|watch|https?:/);
});

test('intention: "Back to studying" works right away, is counted, and stores no typed text', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'intention');
  await visit(site, YOUTUBE);
  await expect(site).toHaveURL(INTENTION_PAGE);
  await site.getByLabel(QUESTION).fill(TYPED);
  await site.getByRole('button', { name: 'Back to studying' }).click();
  await expect(site).toHaveURL(WIKI);
  await expect.poll(() => intentionCounts(background)).toEqual([1, 0, 1]);
  // Going back did not show the prompt a second time.
  await expectNoInterstitial(site, /wikipedia\.org/);
  expect(await intentionCounts(background)).toEqual([1, 0, 1]);

  // Also right away with nothing typed, in a second visit.
  await visit(site, YOUTUBE);
  await expect(site).toHaveURL(INTENTION_PAGE);
  await site.getByRole('button', { name: 'Back to studying' }).click();
  await expect(site).toHaveURL(WIKI);
  await expect.poll(() => intentionCounts(background)).toEqual([2, 0, 2]);

  expect(JSON.stringify(await background.storage())).not.toContain('TYPED');
});

test('intention: no prompt for Study sites in an intention session', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'intention');
  await site.goto('https://en.wikipedia.org/wiki/Study');
  await expectNoInterstitial(site, /wikipedia\.org/);
  expect(await intentionCounts(background)).toEqual([0, 0, 0]);
});

test('intention: a friction session shows the countdown, never the intention prompt', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'friction');
  await visit(site, YOUTUBE);
  await expect(site).toHaveURL(FRICTION_PAGE);
  await expect(site.getByLabel(QUESTION)).toHaveCount(0);
  expect(await intentionCounts(background)).toEqual([0, 0, 0]);
});

test('intention: My Data shows the counts for the finished session', async ({
  context,
  background,
  openOptions,
  openPopup,
  openMyData,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'intention');
  await visit(site, YOUTUBE);
  await site.getByLabel(QUESTION).fill('quick check');
  await site.getByRole('button', { name: 'Continue to youtube.com' }).click();
  await expect(site).toHaveURL(YOUTUBE);
  await expect.poll(() => intentionCounts(background)).toEqual([1, 1, 0]);

  const popup = await openPopup();
  await popup.getByRole('button', { name: 'End early' }).click();
  await popup.getByRole('button', { name: 'Skip' }).click();

  const myData = await openMyData();
  const table = myData.getByRole('table', { name: 'Focus sessions' });
  await expect(table.getByRole('columnheader', { name: 'Intention prompts' })).toBeVisible();
  await expect(table.getByText('1 shown · 1 continued · 0 turned back')).toBeVisible();
  await expect(myData.getByText('quick check')).toHaveCount(0);
});
