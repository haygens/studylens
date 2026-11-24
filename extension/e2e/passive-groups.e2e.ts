/**
 * End-to-end: passive study groups (P18) with two browser profiles against the local web API
 * (started by playwright.config.ts with a fresh database). Focus minutes and "focusing now" reach
 * the other member; the switches hide them at once; leaving removes the member; nothing is sent
 * when the switches are off or for solo users.
 *
 * Permissions turned off can't be simulated here (the E2E build has its local server as a
 * required permission, and Playwright can't click Firefox's prompts); that is unit-tested
 * (src/groups/permission.test.ts, activity-sync.test.ts).
 */
import type { Locator, Page } from '@playwright/test';
import { E2E_API_BASE } from '../server-urls';
import { expect, launchExtension, startSession, test, type Background } from './fixtures';
import { countRequests, joinCodeOf, members, row, startGroups } from './group-helpers';

const GROUP = 'P18 Study';
const MIN = 60_000;

/** A finished, checked-in session today (so there are focus minutes to share). */
async function seedFinishedSession(background: Background): Promise<number> {
  const now = Date.now();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const end = now - MIN;
  const start = Math.max(midnight.getTime(), end - 30 * MIN);
  await background.set({
    'sessions:history': [
      {
        id: 'seeded-1',
        goal: 'Seeded reading',
        plannedMinutes: 50,
        start,
        plannedEnd: start + 50 * MIN,
        condition: null,
        mode: 'solo',
        sessionNumber: 1,
        labelSetVersion: 1,
        labelsLocked: false,
        actualEnd: end,
        endedEarly: true,
        minutesByCategory: { study: 0, neutral: 0, distraction: 0 },
        distractionVisits: 0,
        checkIn: { skipped: true, reason: 'user', answeredAt: end },
      },
    ],
    'sessions:counter': 1,
  });
  return Math.floor((end - start) / MIN);
}

/** Clicks Refresh until `check` passes (the server gets the data a moment after the action). */
async function refreshUntil(page: Page, check: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await check();
  }).toPass({ timeout: 20_000, intervals: [500, 1000, 2000] });
}

const card = (page: Page, name = GROUP): Locator =>
  page.getByRole('region', { name: `Group ${name}` });

/** Creates the group in profile A's options page, with the switches as given. */
async function createGroup(page: Page, sharing: { minutes: boolean; focusing: boolean }) {
  await page.goto(page.url().replace(/#.*$/, '') + '#groups');
  await startGroups(page);
  // The explanation comes first; both switches start ON.
  await expect(
    page.getByRole('heading', { name: 'What your group will see about you' }),
  ).toBeVisible();
  const minutes = page.getByLabel(/Share my focus minutes/);
  const focusing = page.getByLabel(/Show when I’m focusing/);
  await expect(minutes).toBeChecked();
  await expect(focusing).toBeChecked();
  await expect(page.getByText('Others in this group see:')).toBeVisible();
  if (!sharing.minutes) await minutes.uncheck();
  if (!sharing.focusing) await focusing.uncheck();
  await page.getByLabel('Your display name').fill('Sam');
  await page.getByLabel('Group name').fill(GROUP);
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(members(page, GROUP)).toHaveCount(1);
  return joinCodeOf(page, GROUP);
}

test('totals and focusing-now reach the other member; switches hide them; leaving removes them', async ({
  headless,
  context,
  openOptions,
  openPopup,
  background,
}) => {
  const totalsSent = countRequests(context, E2E_API_BASE, '/api/totals');
  const presenceSent = countRequests(context, E2E_API_BASE, '/api/presence');
  const minutes = await seedFinishedSession(background);
  const today = `${minutes} min focused today`;

  const a = await openOptions();
  const code = await createGroup(a, { minutes: true, focusing: true });
  // The live preview on my own card shows exactly what others see.
  await expect(card(a).getByText('Others in this group see:')).toBeVisible();
  await expect(card(a).locator('[id^="sl-sharing-"]').getByText(today)).toBeVisible();

  const personB = await launchExtension(headless);
  try {
    const b = await personB.open('options.html#groups');
    await startGroups(b);
    await b.getByLabel('Your display name').fill('Alex');
    await b.getByLabel('Join code').fill(code);
    await b.getByRole('button', { name: 'Join group' }).click();
    await expect(b.getByRole('status').filter({ hasText: `You joined “${GROUP}”` })).toBeVisible();

    // A starts a focus session: "focusing now" and today's minutes go to the server.
    const popupA = await openPopup();
    await startSession(popupA, 'Group focus', 600);
    const sam = members(b, GROUP).first();
    await refreshUntil(b, async () => {
      await expect(sam).toHaveText(row('Sam · started the group'), { timeout: 1000 });
      await expect(sam).toContainText(today, { timeout: 1000 });
      await expect(sam).toContainText('Focusing now', { timeout: 1000 });
    });
    // The 7-day strip, with its numbers as text for screen readers.
    await expect(sam.getByRole('img', { name: new RegExp(`today ${minutes} min$`) })).toBeVisible();
    expect(totalsSent()).toBeGreaterThan(0);
    expect(presenceSent()).toBeGreaterThan(0);

    // hs's manual test (2026-11-23): A's page was open since before B joined. The automatic
    // refresh (here: coming back to the tab) updates the members, and the count must match.
    await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(members(a, GROUP)).toHaveCount(2);
    await expect(card(a).getByText('Members (2 of 20):')).toBeVisible();
    // The preview and my own row show the same, newest minutes.
    const myRow = members(a, GROUP).first();
    await expect(myRow).toContainText(today);
    const preview = card(a).locator('[id^="sl-sharing-"]');
    await expect(preview).toContainText(today);

    // B's popup: "1 friend focusing now", linking to Study groups.
    const popupB = await personB.open('popup.html');
    await expect(popupB.getByText('1 friend focusing now')).toBeVisible();
    await expect(popupB.getByRole('button', { name: 'Study groups' }).first()).toBeVisible();

    // A turns "Show when I'm focusing" off: B no longer sees the badge; minutes stay.
    const focusing = card(a).getByLabel(/Show when I’m focusing/);
    await focusing.uncheck();
    await expect(focusing).not.toBeChecked();
    await refreshUntil(b, async () => {
      await expect(sam).not.toContainText('Focusing now', { timeout: 1000 });
      await expect(sam).toContainText(today, { timeout: 1000 });
    });
    await popupB.reload();
    await expect(popupB.getByText(/focusing now/)).toHaveCount(0);

    // A turns "Share my focus minutes" off: B sees "not shared", no strip.
    const shareMinutes = card(a).getByLabel(/Share my focus minutes/);
    await shareMinutes.uncheck();
    await expect(shareMinutes).not.toBeChecked();
    await refreshUntil(b, async () => {
      await expect(sam).toContainText('Focus minutes not shared', { timeout: 1000 });
    });
    await expect(sam.getByRole('img')).toHaveCount(0);
    expect(Object.values(await background.get<Record<string, unknown>>('groups:sharing'))).toEqual([
      { focusMinutes: false, focusingNow: false },
    ]);

    // Back on: the extension sends today's minutes again (the server had deleted them).
    await shareMinutes.check();
    await expect(shareMinutes).toBeChecked();
    await refreshUntil(b, async () => {
      await expect(sam).toContainText(today, { timeout: 1000 });
    });

    // B leaves: A no longer sees B.
    await refreshUntil(a, async () => {
      await expect(members(a, GROUP)).toHaveCount(2, { timeout: 1000 });
    });
    await b.getByRole('button', { name: 'Leave group' }).click();
    await b.getByRole('button', { name: 'Yes, leave' }).click();
    await expect(b.getByText(`You left “${GROUP}”.`)).toBeVisible();
    await refreshUntil(a, async () => {
      await expect(members(a, GROUP)).toHaveText([row('Sam (you) · started the group')], {
        timeout: 1000,
      });
    });
    expect(await personB.background.get('groups:sharing')).toEqual({});
  } finally {
    await personB.close();
  }
});

test('switches off: sessions send no totals and no presence; the group shows nothing', async ({
  headless,
  context,
  openOptions,
  openPopup,
  background,
}) => {
  const activitySent = countRequests(context, E2E_API_BASE, '/api/totals');
  const presenceSent = countRequests(context, E2E_API_BASE, '/api/presence');
  await seedFinishedSession(background);
  const a = await openOptions();
  const code = await createGroup(a, { minutes: false, focusing: false });

  const personB = await launchExtension(headless);
  try {
    const b = await personB.open('options.html#groups');
    await startGroups(b);
    await b.getByLabel('Your display name').fill('Alex');
    await b.getByLabel('Join code').fill(code);
    await b.getByRole('button', { name: 'Join group' }).click();
    await expect(members(b, GROUP)).toHaveCount(2);

    const popupA = await openPopup();
    await startSession(popupA, 'Private focus', 600);
    await popupA.getByRole('button', { name: 'End early' }).click();

    await b.getByRole('button', { name: 'Refresh' }).click();
    const sam = members(b, GROUP).first();
    await expect(sam).toContainText('Focus minutes not shared');
    await expect(sam).not.toContainText('Focusing now');
    expect(activitySent()).toBe(0);
    expect(presenceSent()).toBe(0);
    // Nothing was ever recorded as sent.
    expect(await background.get('groups:activity-sync')).toBeUndefined();
    // The session is still a solo session; only the local covariate notes the group.
    const [, ended] =
      (await background.get<{ mode: string; inGroup?: boolean }[]>('sessions:history')) ?? [];
    expect(ended).toMatchObject({ mode: 'solo', inGroup: true });
  } finally {
    await personB.close();
  }
});

test('solo user with sessions: no study group traffic at all', async ({
  context,
  openPopup,
  background,
}) => {
  const sent = countRequests(context, E2E_API_BASE);
  await seedFinishedSession(background);
  const popup = await openPopup();
  await startSession(popup, 'Solo', 5);
  await expect(popup.getByText(/finish your goal/i)).toBeVisible({ timeout: 20_000 });
  await popup.reload();
  await expect(popup.getByText(/focusing now/)).toHaveCount(0);
  expect(sent()).toBe(0);
  expect(await background.get('groups:activity-sync')).toBeUndefined();
  const history = (await background.get<{ inGroup?: boolean }[]>('sessions:history')) ?? [];
  expect(history.at(-1)).toMatchObject({ inGroup: false });
});
