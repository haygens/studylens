/**
 * End-to-end on the NORMAL Edge build (not the E2E test build), with nothing written to storage:
 * exactly what a real user gets after installing or updating to v0.2.0. Research interventions
 * are on by default, so the one-time notice must show, and no session can start until it is
 * answered — neither from the popup nor by messaging the background directly.
 */
import type { Page } from '@playwright/test';
import type { ActiveSession } from '../src/sessions/session';
import { expect, test } from './fixtures';

test.use({ build: 'normal', seed: {} });

/** Sends a message to the background from an extension page, as the popup would. */
function sendFrom(page: Page, message: object): Promise<unknown> {
  return page.evaluate(
    (m) =>
      (
        globalThis as unknown as {
          chrome: { runtime: { sendMessage(m: object): Promise<unknown> } };
        }
      ).chrome.runtime.sendMessage(m),
    message,
  );
}

test('default install: the short notice explains the helpers and must be answered before a session starts', async ({
  openPopup,
  background,
}) => {
  const popup = await openPopup();
  // Really the normal build: no E2E-only controls.
  await expect(popup.getByText('Test length in seconds (E2E build only)')).toHaveCount(0);

  const notice = popup.getByRole('dialog', { name: 'Research interventions' });
  await expect(notice).toBeVisible();
  // The short notice (P13b): what the helpers are, in a few words, with a link to the details.
  await expect(notice.getByText('New: focus helpers')).toBeVisible();
  await expect(notice.getByText(/a short wait/)).toBeVisible();
  await expect(notice.getByText(/What did you come here for\?/)).toBeVisible();
  await expect(notice.getByText(/never saves what you type/)).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Learn more' })).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Keep on' })).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Turn off' })).toBeVisible();

  // The Start button waits for an answer, even with a goal filled in.
  await popup.getByLabel('What will you work on?').fill('Read chapter 5');
  const start = popup.getByRole('button', { name: 'Start focus session' });
  await expect(start).toBeDisabled();
  await expect(popup.getByRole('note')).toContainText('research notice');

  // Going around the popup doesn't work either: the background refuses.
  expect(await sendFrom(popup, { type: 'session:start', goal: 'Sneaky', minutes: 25 })).toEqual({
    ok: false,
    error: 'notice-unanswered',
  });
  expect(await background.get('sessions:active')).toBeFalsy();

  // Closing the popup without answering: the notice is still there next time.
  await popup.close();
  const again = await openPopup();
  await expect(again.getByRole('dialog', { name: 'Research interventions' })).toBeVisible();
  expect(await background.get('interventions:notice-seen')).toBeUndefined();

  // "Keep on": the Start button works and the session gets one of the three conditions.
  await again.getByRole('button', { name: 'Keep on' }).click();
  await expect(again.getByRole('dialog', { name: 'Research interventions' })).toHaveCount(0);
  await again.getByLabel('What will you work on?').fill('Read chapter 5');
  await expect(again.getByRole('button', { name: 'Start focus session' })).toBeEnabled();
  await again.getByRole('button', { name: 'Start focus session' }).click();
  await expect(again.getByText('Focusing on')).toBeVisible();
  const session = await background.get<ActiveSession>('sessions:active');
  expect(['control', 'friction', 'intention']).toContain(session.condition);
  expect(await background.get('interventions:notice-seen')).toBe(true);
});

test('default install: "Turn off" also unlocks Start, and the session is opted out', async ({
  openPopup,
  background,
}) => {
  const popup = await openPopup();
  await popup.getByRole('button', { name: 'Turn off' }).click();
  await popup.getByLabel('What will you work on?').fill('Essay outline');
  await popup.getByRole('button', { name: 'Start focus session' }).click();
  await expect(popup.getByText('Focusing on')).toBeVisible();
  expect((await background.get<ActiveSession>('sessions:active')).condition).toBe('opted-out');
});
