/**
 * End-to-end: the friction intervention (P9) with research interventions turned on for the test.
 * The session's condition is chosen by writing the shuffled block before the session starts.
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
const FRICTION_PAGE = /\/friction\.html\?/;
const GOAL = 'Finish lab report';

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

const counts = async (background: Background) => {
  const s = await background.get<ActiveSession>('sessions:active');
  return [s.frictionShown, s.frictionContinued, s.frictionTurnedBack];
};

/** Waits a moment and checks the tab was NOT sent to the countdown page. */
async function expectNoFriction(site: Page, url: RegExp): Promise<void> {
  await site.waitForTimeout(1500);
  await expect(site).toHaveURL(url);
}

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
  await expect(site.getByRole('button', { name: 'Back to studying' })).toBeEnabled();
  const continueButton = site.getByRole('button', { name: 'Continue to youtube.com' });
  await expect(continueButton).toHaveCount(0);
  expect(await counts(background)).toEqual([1, 0, 0]);

  // Stop the background service worker during the countdown: Continue must still work.
  await stopBackground(context, site);
  await expect(continueButton).toBeVisible({ timeout: 15_000 });
  await continueButton.click();
  await expect(site).toHaveURL(YOUTUBE);
  await expect.poll(() => counts(background)).toEqual([1, 1, 0]);

  // Grace period: leaving and coming back within 5 minutes shows no second countdown.
  await site.goto(WIKI);
  await visit(site, YOUTUBE);
  await expectNoFriction(site, /youtube\.com\/watch/);
  expect(await counts(background)).toEqual([1, 1, 0]);

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
  await expect.poll(() => counts(background)).toEqual([1, 0, 1]);
  // Going back did not show the countdown a second time.
  await expectNoFriction(site, /wikipedia\.org/);
  expect(await counts(background)).toEqual([1, 0, 1]);
});

test('friction: no countdown for Study sites, or in control sessions', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  // Study site (setup already opened Wikipedia).
  const site = await setup({ context, background, openOptions, openPopup }, 'control');
  await expectNoFriction(site, /wikipedia\.org/);

  // Distraction site in a control session.
  await visit(site, YOUTUBE);
  await expectNoFriction(site, /youtube\.com\/watch/);
  expect(await counts(background)).toEqual([0, 0, 0]);
});

test('friction: a Study site in a friction session gets no countdown', async ({
  context,
  background,
  openOptions,
  openPopup,
}) => {
  const site = await setup({ context, background, openOptions, openPopup }, 'friction');
  await site.goto('https://en.wikipedia.org/wiki/Study');
  await expectNoFriction(site, /wikipedia\.org/);
  expect(await counts(background)).toEqual([0, 0, 0]);
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
  expect(await counts(background)).toEqual([1, 0, 0]);
});
