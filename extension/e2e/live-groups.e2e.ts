/**
 * End-to-end: live group focus sessions (P18b) with two browser profiles against the local web
 * API (test seconds are allowed there only: STUDYLENS_LIVE_TEST_SECONDS in web-server.ts).
 *
 * Sam starts a session from the Study groups tab; Alex sees "Live session in …" in the popup and
 * joins late; both share the same end. The host leaves: the session keeps running for Alex. At
 * the end both see the shared summary — Sam's minutes (shared), Alex's "minutes not shared".
 * Group sessions are `mode: "group"`, condition `group`, and don't touch the randomization block.
 *
 * Clock offsets, reconnecting, the offline "leave" retry and the cleanup are unit-tested
 * (src/groups/live.test.ts, src/sessions/group-session.test.ts, web/lib/db/contract.ts).
 */
import type { Page } from '@playwright/test';
import { E2E_API_BASE } from '../server-urls';
import { expect, launchExtension, test } from './fixtures';
import { joinCodeOf, members, startGroups } from './group-helpers';

const GROUP = 'Live Chem';
const SECONDS = 50;

const people = (page: Page) =>
  page.getByRole('list', { name: `Participants in ${GROUP}` }).getByRole('listitem');

test('start, join late, host leaves, shared end and summary', async ({
  headless,
  context,
  openOptions,
  openPopup,
  background,
}) => {
  const startBodies: string[] = [];
  context.on('request', (r) => {
    if (r.url().startsWith(`${E2E_API_BASE}/api/groups/`) && r.url().endsWith('/sessions')) {
      startBodies.push(r.postData() ?? '');
    }
  });
  await background.set({ 'interventions:block': ['intention', 'control'] });
  // The local web server is `next dev`, which compiles a page the first time it is visited (can
  // take over 10 s). Warm up the room page and its API now, not inside the short test session.
  const warm = await context.newPage();
  await warm.goto(`${E2E_API_BASE}/s/${'Z'.repeat(16)}`);
  await expect(
    warm.getByRole('heading', { name: 'This room link has expired or doesn’t exist.' }),
  ).toBeVisible({ timeout: 60_000 });
  await warm.close();

  // Sam creates the group (sharing focus minutes).
  const a = await openOptions();
  await a.goto(a.url().replace(/#.*$/, '') + '#groups');
  await startGroups(a);
  await a.getByLabel('Your display name').fill('Sam');
  await a.getByLabel('Group name').fill(GROUP);
  await a.getByRole('button', { name: 'Create group' }).click();
  await expect(members(a, GROUP)).toHaveCount(1);
  const code = await joinCodeOf(a, GROUP);

  const personB = await launchExtension(headless);
  try {
    // Alex joins the group with "Share my focus minutes" OFF.
    const b = await personB.open('options.html#groups');
    await startGroups(b);
    await b.getByLabel(/Share my focus minutes/).uncheck();
    await b.getByLabel('Your display name').fill('Alex');
    await b.getByLabel('Join code').fill(code);
    await b.getByRole('button', { name: 'Join group' }).click();
    await expect(members(b, GROUP)).toHaveCount(2);

    // Sam starts a live session from the Study groups tab.
    await a.reload();
    const start = a.getByRole('form', { name: 'Start a group session' });
    await expect(start).toBeVisible();
    await start.getByLabel('Goal (optional, your group sees it)').fill('Chapter 4 problems');
    await start.getByLabel('Group test length in seconds (E2E build only)').fill(String(SECONDS));
    await start.getByRole('button', { name: 'Start group session' }).click();
    const liveCard = a.getByRole('region', { name: `Live session in ${GROUP}` });
    await expect(liveCard).toBeVisible();
    await expect(liveCard.getByText('Goal: Chapter 4 problems')).toBeVisible();
    await expect(people(a)).toHaveText(['Sam (you, started it) · Focusing']);
    // P18c: the room link opens the read-only web room (works without the extension).
    await expect(
      liveCard.getByRole('button', { name: `Copy the room link for ${GROUP}` }),
    ).toBeVisible();
    const roomHref = await liveCard
      .getByRole('link', { name: 'Open room page' })
      .getAttribute('href');
    // P21: Sunrise (the default theme) → the Hearth look, in the fragment (never sent to the server).
    expect(roomHref).toMatch(new RegExp(`^${E2E_API_BASE}/s/[A-Z2-9]{16}#look=hearth$`));
    await expect(liveCard).toHaveAttribute('data-look', 'hearth');
    await expect(liveCard.getByText('Live by the fire')).toBeVisible();
    const roomPage = await context.newPage();
    await roomPage.goto(roomHref!);
    await expect(roomPage.getByRole('heading', { level: 1, name: GROUP })).toBeVisible();
    await expect(roomPage.locator('html')).toHaveAttribute('data-look', 'hearth');
    await expect(
      roomPage.getByRole('list', { name: `Participants in ${GROUP}` }).getByRole('listitem'),
    ).toHaveText([/^Sam \(started it\)\s*Focusing$/]);
    await roomPage.close();
    // Only the goal and the length were sent.
    expect(startBodies.map((s) => Object.keys(JSON.parse(s) as object).sort())).toEqual([
      ['goal', 'minutes', 'testSeconds'],
    ]);

    const samLocal = await background.get<Record<string, unknown>>('sessions:active');
    expect(samLocal).toMatchObject({
      mode: 'group',
      condition: 'group',
      goal: 'Chapter 4 problems',
    });
    // The research block was not touched.
    expect(await background.get('interventions:block')).toEqual(['intention', 'control']);

    // Alex's popup: the live session, with time left, and Join.
    const popupB = await personB.open('popup.html');
    const line = popupB.getByRole('list', { name: 'Live group sessions' });
    await expect(line).toContainText(`Live session in ${GROUP}`);
    await expect(line).toContainText(/left/);
    await popupB.getByRole('button', { name: `Join the live session in ${GROUP}` }).click();
    await expect(popupB.getByText(`Group session · ${GROUP}`)).toBeVisible();
    await expect(people(popupB)).toHaveText([
      'Sam (started it) · Focusing',
      'Alex (you) · Focusing',
    ]);
    // The same shared end on both sides (within a second or two of clock measurement).
    const alexLocal = await personB.background.get<{ plannedEnd: number; mode: string }>(
      'sessions:active',
    );
    expect(alexLocal?.mode).toBe('group');
    expect(Math.abs(alexLocal!.plannedEnd - (samLocal!.plannedEnd as number))).toBeLessThan(2000);

    // The host leaves: the session keeps running for Alex.
    await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(people(a)).toContainText(['Sam (you, started it) · Focusing', 'Alex · Focusing']);
    await liveCard.getByRole('button', { name: 'Leave session' }).click();
    await expect(liveCard.getByText('You left this session.')).toBeVisible();
    await popupB.reload();
    await expect(people(popupB)).toHaveText([
      'Sam (started it) · Left early · 0 min',
      'Alex (you) · Focusing',
    ]);
    await expect(popupB.getByRole('button', { name: 'Leave session' })).toBeVisible();
    expect(await background.get('groups:live-pending-leave')).toBeUndefined();

    // The shared end: Alex's popup goes to the check-in, with the group summary.
    await expect(popupB.getByText(/finish your goal/i)).toBeVisible({ timeout: SECONDS * 1000 });
    const summary = popupB.getByRole('region', { name: `Group summary for ${GROUP}` });
    await expect(summary.getByText('Session complete!')).toBeVisible();
    await expect(people(popupB)).toHaveText([
      'Sam (started it) · Left early · 0 min',
      'Alex (you) · Finished · minutes not shared',
    ]);
    const [alexDone] =
      (await personB.background.get<{ mode: string; condition: string; endedEarly: boolean }[]>(
        'sessions:history',
      )) ?? [];
    expect(alexDone).toMatchObject({ mode: 'group', condition: 'group', endedEarly: false });

    // Sam's popup: own (private) check-in plus the same shared summary.
    const popupA = await openPopup();
    await expect(popupA.getByText(/finish your goal/i)).toBeVisible();
    await expect(
      popupA
        .getByRole('region', { name: `Group summary for ${GROUP}` })
        .getByText('Session complete!'),
    ).toBeVisible();
  } finally {
    await personB.close();
  }
});
