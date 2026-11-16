/**
 * End-to-end: site labels (P3), focus sessions (P4) and the end-of-session check-in (P5), in a
 * real browser with the E2E build of the extension. Sessions are a few seconds long.
 */
import type { CategoryRule } from '../src/categories/rules';
import type { FocusSession } from '../src/sessions/session';
import { expect, labelSites, startSession, test } from './fixtures';

const lastSession = (history: FocusSession[] | undefined) => history?.at(-1);

test('a. labels wikipedia.org as Study and youtube.com as Distraction on the options page', async ({
  openOptions,
  background,
}) => {
  await labelSites(openOptions);
  const rules = await background.get<CategoryRule[]>('categories:rules');
  expect(rules).toEqual(
    expect.arrayContaining([
      { domain: 'wikipedia.org', category: 'study' },
      { domain: 'youtube.com', category: 'distraction' },
    ]),
  );
});

test('b. session ends with the popup closed: badge "?", check-in on next open, answers saved', async ({
  context,
  openOptions,
  openPopup,
  background,
}) => {
  await labelSites(openOptions);

  const popup = await openPopup();
  await startSession(popup, 'Read chapter 4', 25);
  await popup.close();

  // Wikipedia → YouTube → Wikipedia → YouTube, a few seconds each.
  const site = await context.newPage();
  await site.bringToFront();
  for (const url of [
    'https://en.wikipedia.org/wiki/Focus',
    'https://www.youtube.com/watch?v=1',
    'https://en.wikipedia.org/wiki/Study',
    'https://www.youtube.com/watch?v=2',
  ]) {
    await site.goto(url);
    await site.waitForTimeout(4_000);
  }

  // The end alarm ends the session with no popup open.
  await expect.poll(() => background.get('sessions:active'), { timeout: 60_000 }).toBeNull();
  await expect.poll(() => background.badge()).toBe('?');

  const done = lastSession(await background.get<FocusSession[]>('sessions:history'));
  expect(done).toMatchObject({ goal: 'Read chapter 4', endedEarly: false, checkIn: null });
  expect(done?.distractionVisits).toBe(2);
  expect(done?.minutesByCategory.study).toBeGreaterThan(0);
  expect(done?.minutesByCategory.distraction).toBeGreaterThan(0);

  // The next popup opens on the check-in, before the Start form.
  const next = await openPopup();
  await expect(next.getByText('Did you finish your goal?')).toBeVisible();
  await expect(next.getByText('Read chapter 4')).toBeVisible();
  await expect(next.getByRole('button', { name: 'Start focus session' })).toHaveCount(0);

  await next.getByRole('button', { name: 'Partly' }).click();
  await next.getByRole('button', { name: '4 – mostly focused' }).click();
  await next.getByRole('button', { name: 'Save' }).click();

  await expect(next.getByText('Finished: partly · Focus 4/5')).toBeVisible();
  await expect(next.getByRole('button', { name: 'Start focus session' })).toBeVisible();
  await expect.poll(() => background.badge()).toBe('');

  const answered = lastSession(await background.get<FocusSession[]>('sessions:history'));
  expect(answered?.checkIn).toMatchObject({ goalCompleted: 'partly', focusRating: 4 });
});

test('c. popup open at the end switches to the check-in; Skip is recorded', async ({
  openPopup,
  background,
}) => {
  const popup = await openPopup();
  await startSession(popup, 'Flashcards', 4);

  // Popup stays open: it switches straight to the check-in when the session ends.
  await expect(popup.getByText('Did you finish your goal?')).toBeVisible({ timeout: 30_000 });
  await popup.getByRole('button', { name: 'Skip' }).click();

  await expect(popup.getByText('Check-in skipped')).toBeVisible();
  await expect.poll(() => background.badge()).toBe('');
  const done = lastSession(await background.get<FocusSession[]>('sessions:history'));
  expect(done?.checkIn).toMatchObject({ skipped: true, reason: 'user' });
});

test('d. End early shows the check-in right away and marks the session endedEarly', async ({
  openPopup,
  background,
}) => {
  const popup = await openPopup();
  await startSession(popup, 'Essay outline', 300);
  await popup.getByRole('button', { name: 'End early' }).click();

  await expect(popup.getByText('Did you finish your goal?')).toBeVisible();
  await expect(popup.getByText('Session over (ended early). Your goal was')).toBeVisible();
  await expect.poll(() => background.badge()).toBe('?');

  const done = lastSession(await background.get<FocusSession[]>('sessions:history'));
  expect(done).toMatchObject({ goal: 'Essay outline', endedEarly: true, checkIn: null });
});
