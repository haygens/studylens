/**
 * End-to-end: the My Data page (P6) — raw tables, export, delete everything, pause/resume.
 */
import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import type { FocusSession } from '../src/sessions/session';
import { expect, labelSites, startSession, test, type Background } from './fixtures';

const WIKI = 'https://en.wikipedia.org/wiki/Focus';
const YOUTUBE = 'https://www.youtube.com/watch?v=1';

/** Opens `urls` one after another in a site tab, `ms` each. Leaving a page ends its record. */
async function browse(context: BrowserContext, urls: string[], ms = 2_500): Promise<Page> {
  const site = await context.newPage();
  await site.bringToFront();
  for (const url of urls) {
    await site.goto(url);
    await site.waitForTimeout(ms);
  }
  return site;
}

/** Hostnames of all finished activity records in storage. */
async function recordedHosts(background: Background): Promise<string[]> {
  const stored = await background.storage();
  return Object.entries(stored)
    .filter(([key]) => key.startsWith('activity:'))
    .flatMap(([, value]) => (value as { hostname: string }[]).map((s) => s.hostname));
}

test('shows a visited site and a finished session, and exports them as JSON', async ({
  context,
  openPopup,
  openMyData,
  background,
}) => {
  const popup = await openPopup();
  await startSession(popup, 'Read chapter 4', 8);
  await popup.close();
  const site = await browse(context, [WIKI, YOUTUBE]);
  await expect.poll(() => background.get('sessions:active'), { timeout: 30_000 }).toBeNull();
  await site.close();

  const page = await openMyData();
  const activity = page.getByRole('table', { name: /^Activity on / });
  await expect(activity.getByRole('cell', { name: 'en.wikipedia.org' })).toBeVisible();
  const sessions = page.getByRole('table', { name: 'Focus sessions' });
  await expect(sessions.getByRole('cell', { name: 'Read chapter 4' })).toBeVisible();
  await expect(sessions.getByRole('cell', { name: 'Not answered yet' })).toBeVisible();
  await expect(page.getByText('What StudyLens never collects')).toBeVisible();
  await expect(page.getByText(/kept for 30 days/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export my data (JSON)' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^studylens-export-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8')) as {
    app: string;
    storage: Record<string, unknown>;
  };
  expect(exported.app).toBe('StudyLens');
  const history = exported.storage['sessions:history'] as FocusSession[];
  expect(history.map((s) => s.goal)).toEqual(['Read chapter 4']);
  const hosts = Object.entries(exported.storage)
    .filter(([key]) => key.startsWith('activity:'))
    .flatMap(([, v]) => (v as { hostname: string }[]).map((s) => s.hostname));
  expect(hosts).toContain('en.wikipedia.org');
});

test('delete everything empties storage, ends a running session, and clears the badge', async ({
  context,
  openOptions,
  openPopup,
  openMyData,
  background,
}) => {
  await labelSites(openOptions);
  (await browse(context, [WIKI, YOUTUBE])).close();
  const popup = await openPopup();
  await startSession(popup, 'Essay outline', 300);
  await popup.close();
  await expect.poll(() => background.badge()).toBe('5');
  expect(await recordedHosts(background)).toContain('en.wikipedia.org');

  const page = await openMyData();
  const confirm = page.getByLabel('Type DELETE to confirm:');
  const button = page.getByRole('button', { name: 'Delete everything' });
  await expect(button).toBeDisabled();
  await confirm.fill('delete');
  await expect(button).toBeDisabled();
  await confirm.fill('DELETE');
  await button.click();

  await expect(page.getByText('Everything is deleted.')).toBeVisible();
  await expect(page.getByText('No activity records.')).toBeVisible();
  await expect(page.getByText('No finished focus sessions.')).toBeVisible();
  await expect(page.getByText('No site labels.')).toBeVisible();
  await expect(page.getByText('No focus session running.')).toBeVisible();

  // Only the tracker's own bookkeeping may come back (it records nothing on this page).
  const left = await background.storage();
  expect(Object.keys(left).filter((k) => k !== 'tracker:state')).toEqual([]);
  expect((left['tracker:state'] as { open: unknown } | undefined)?.open ?? null).toBeNull();
  await expect.poll(() => background.badge()).toBe('');
  expect((await background.alarmNames()).filter((n) => n.includes('session'))).toEqual([]);

  // The popup is back to a fresh Start form: no check-in, no Last session.
  const after = await openPopup();
  await expect(after.getByRole('button', { name: 'Start focus session' })).toBeVisible();
  await expect(after.getByText('Did you finish your goal?')).toHaveCount(0);
  await expect(after.getByText(/Last session/)).toHaveCount(0);
});

test('pause stops recording (session timer keeps running); resume starts it again', async ({
  context,
  openPopup,
  openMyData,
  background,
}) => {
  const popup = await openPopup();
  await startSession(popup, 'Problem set', 300);
  await popup.getByRole('button', { name: 'Pause tracking' }).click();
  await expect(popup.getByText('Tracking paused')).toBeVisible();
  await expect(popup.getByText('Focusing on')).toBeVisible();
  expect(await background.get('tracking:paused')).toBe(true);
  await popup.close();

  const site = await browse(context, [YOUTUBE, WIKI]);
  expect(await recordedHosts(background)).toEqual([]);

  // Resume on the My Data page.
  const page = await openMyData();
  const toggle = page.getByLabel('Pause tracking');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(() => background.get('tracking:paused')).toBe(false);
  await page.close();

  await site.bringToFront();
  await site.goto(YOUTUBE);
  await site.waitForTimeout(2_500);
  await site.goto(WIKI);
  await expect.poll(() => recordedHosts(background)).toContain('youtube.com');
  expect(await recordedHosts(background)).not.toContain('en.wikipedia.org');

  // The session is still running and its timer was never stopped.
  const reopened = await openPopup();
  await expect(reopened.getByText('Focusing on')).toBeVisible();
  await expect(reopened.getByRole('button', { name: 'Pause tracking' })).toBeVisible();
});
