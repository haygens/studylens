/**
 * End-to-end: the intervention engine (P8) with the feature flag turned on for the test.
 * Conditions are assigned per session from a shuffled block, can be opted out of on My Data,
 * and the popup's one-time notice shows exactly once.
 */
import type { Page } from '@playwright/test';
import type { FocusSession } from '../src/sessions/session';
import { enableInterventions, expect, startSession, test, type Background } from './fixtures';

const conditions = async (background: Background) =>
  ((await background.get<FocusSession[]>('sessions:history')) ?? []).map((s) => s.condition);

/** Starts a short session, ends it early and skips the check-in. */
async function shortSession(popup: Page, goal: string): Promise<void> {
  await startSession(popup, goal, 300);
  // The condition is never shown while starting or running a session.
  await expect(popup.getByText(/control|friction|intention|condition/i)).toHaveCount(0);
  await popup.getByRole('button', { name: 'End early' }).click();
  await popup.getByRole('button', { name: 'Skip' }).click();
  await expect(popup.getByText('Check-in skipped')).toBeVisible();
}

test('three sessions get each condition exactly once', async ({ openPopup, background }) => {
  await enableInterventions(background);
  await background.set({ 'interventions:notice-seen': true });
  const popup = await openPopup();
  for (const goal of ['One', 'Two', 'Three']) await shortSession(popup, goal);

  const got = await conditions(background);
  expect(got).toHaveLength(3);
  expect([...got].sort()).toEqual(['control', 'friction', 'intention']);
  // The block is used up; the next session shuffles a new one.
  expect(await background.get('interventions:block')).toEqual([]);
});

test('after turning research interventions off on My Data, the next session is "opted-out"', async ({
  openPopup,
  openMyData,
  background,
}) => {
  await enableInterventions(background);
  await background.set({ 'interventions:notice-seen': true });
  const popup = await openPopup();
  await shortSession(popup, 'Before');
  const blockBefore = await background.get<string[]>('interventions:block');

  const myData = await openMyData();
  const toggle = myData.getByLabel('Take part in research interventions');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(() => background.get('interventions:opted-out')).toBe(true);

  await shortSession(popup, 'After');
  expect((await conditions(background)).at(-1)).toBe('opted-out');
  // Opted-out sessions don't use up the block.
  expect(await background.get('interventions:block')).toEqual(blockBefore);

  // My Data shows the condition per session.
  await expect(
    myData
      .getByRole('table', { name: 'Focus sessions' })
      .getByText('Opted out (research interventions off)'),
  ).toBeVisible();
});

test('the one-time notice shows once and never again', async ({ openPopup, background }) => {
  // Feature off: no notice.
  const off = await openPopup();
  await expect(off.getByRole('button', { name: 'Start focus session' })).toBeVisible();
  await expect(off.getByRole('dialog', { name: 'Research interventions' })).toHaveCount(0);
  await off.close();

  await enableInterventions(background);
  const first = await openPopup();
  const notice = first.getByRole('dialog', { name: 'Research interventions' });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Turn off' })).toBeVisible();
  await notice.getByRole('button', { name: 'Keep on' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => background.get('interventions:notice-seen')).toBe(true);
  expect(await background.get('interventions:opted-out')).toBeUndefined();
  await first.close();

  for (let i = 0; i < 2; i++) {
    const again = await openPopup();
    await expect(again.getByRole('button', { name: 'Start focus session' })).toBeVisible();
    await expect(again.getByRole('dialog', { name: 'Research interventions' })).toHaveCount(0);
    await again.close();
  }
});

test('"Turn off" in the notice opts out', async ({ openPopup, background }) => {
  await enableInterventions(background);
  const popup = await openPopup();
  await popup.getByRole('button', { name: 'Turn off' }).click();
  await expect.poll(() => background.get('interventions:opted-out')).toBe(true);
  await expect(popup.getByRole('dialog', { name: 'Research interventions' })).toHaveCount(0);
  await shortSession(popup, 'Opted out');
  expect(await conditions(background)).toEqual(['opted-out']);
});
