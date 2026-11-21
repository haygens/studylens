/**
 * Welcome page on a new install (P13b): pick a theme, label a site, answer the research helpers
 * question, and then a session can start. A real default install (nothing seeded), so research
 * interventions are on and the helpers question must be answered first.
 */
import type { ActiveSession } from '../src/sessions/session';
import { expect, test } from './fixtures';

test.use({ welcome: 'keep', seed: {} });

test('welcome: pick a theme, label a site, answer the helpers step, then a session starts', async ({
  welcomePage: welcome,
  background,
  openPopup,
}) => {
  // Step 1 of 3: Pick your look.
  await expect(welcome.getByRole('heading', { name: 'Pick your look' })).toBeVisible();
  await expect(welcome.getByText('Step 1 of 3')).toBeVisible();
  await expect(welcome.getByRole('radio', { name: /Sunrise/ })).toBeChecked(); // the default
  await welcome.getByRole('radio', { name: /Ocean/ }).check();
  await expect(welcome.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect.poll(() => background.get('ui:theme')).toBe('ocean');
  await welcome.getByRole('button', { name: 'Next' }).click();

  // Step 2 of 3: Label a few sites.
  await expect(welcome.getByRole('heading', { name: 'Label a few sites' })).toBeVisible();
  await expect(welcome.getByText('Step 2 of 3')).toBeVisible();
  const youtube = welcome.getByRole('group', { name: 'Label for youtube.com' });
  await youtube.getByRole('button', { name: 'Distraction' }).click();
  await expect(youtube.getByRole('button', { name: 'Distraction' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() => background.get('categories:rules'))
    .toEqual([{ domain: 'youtube.com', category: 'distraction' }]);
  await welcome.getByRole('button', { name: 'Next' }).click();

  // Step 3 of 3: How StudyLens helps. Finish waits for an answer, and says why.
  await expect(welcome.getByRole('heading', { name: 'How StudyLens helps' })).toBeVisible();
  const finish = welcome.getByRole('button', { name: 'Finish' });
  await expect(finish).toBeDisabled();
  await expect(welcome.getByRole('note')).toContainText('Choose “Keep on” or “Turn off”');
  // The explanation is short (under ~60 words).
  const text = await welcome.locator('main p').first().innerText();
  expect(text.split(/\s+/).length).toBeLessThanOrEqual(60);
  await welcome.getByRole('button', { name: 'Keep on' }).click();
  await expect(finish).toBeEnabled();
  expect(await background.get('interventions:notice-seen')).toBe(true);
  await finish.click();

  // All set: tells the user where the toolbar button is.
  await expect(welcome.getByRole('heading', { name: 'You’re all set!' })).toBeVisible();
  await expect(welcome.getByText('Click the StudyLens button')).toBeVisible();
  await expect.poll(() => background.get('onboarding:welcome')).toBe('done');

  // The popup: Ocean theme, no research notice, no "finish setup", and a session starts.
  const popup = await openPopup();
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect(popup.getByRole('dialog', { name: 'Research interventions' })).toHaveCount(0);
  await expect(popup.getByText('Finish setting up StudyLens')).toHaveCount(0);
  await popup.getByLabel('What will you work on?').fill('Problem set 3');
  await popup.getByRole('button', { name: 'Start focus session' }).click();
  await expect(popup.getByText('Focusing on')).toBeVisible();
  const session = await background.get<ActiveSession>('sessions:active');
  expect(['control', 'friction', 'intention']).toContain(session.condition);
});

test('welcome: Skip on the sites step; closing early keeps Sunrise and the popup offers to finish', async ({
  welcomePage: welcome,
  background,
  openPopup,
}) => {
  await welcome.getByRole('button', { name: 'Next' }).click();
  await welcome.getByRole('button', { name: 'Skip' }).click();
  await expect(welcome.getByRole('heading', { name: 'How StudyLens helps' })).toBeVisible();
  expect(await background.get('categories:rules')).toBeUndefined();
  await welcome.getByRole('button', { name: 'Back' }).click();
  await expect(welcome.getByRole('heading', { name: 'Label a few sites' })).toBeVisible();
  await welcome.close();

  // Closed before the helpers step: default theme, the short notice, and a way back.
  const popup = await openPopup();
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'sunrise');
  expect(await background.get('ui:theme')).toBeUndefined();
  await expect(popup.getByRole('dialog', { name: 'Research interventions' })).toBeVisible();
  await popup.getByLabel('What will you work on?').fill('Essay');
  await expect(popup.getByRole('button', { name: 'Start focus session' })).toBeDisabled();
  await expect(popup.getByRole('note')).toContainText('research notice');
  const [reopened] = await Promise.all([
    popup.context().waitForEvent('page'),
    popup.getByRole('button', { name: 'Finish setting up StudyLens' }).click(),
  ]);
  await expect(reopened).toHaveURL(/\/welcome\.html$/);
  await expect(reopened.getByRole('heading', { name: 'Pick your look' })).toBeVisible();
});
