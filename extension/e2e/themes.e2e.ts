/**
 * Themes (P13b): switching on the Settings tab restyles every open page right away, "Delete
 * everything" resets to Sunrise, and no screen renders blank in any theme.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const THEMES = ['sunrise', 'ocean', 'pastel'] as const;

test('Settings: picking a theme restyles open pages live; Delete everything resets it', async ({
  openOptions,
  openPopup,
  openMyData,
  background,
}) => {
  const popup = await openPopup();
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'sunrise');

  const options = await openOptions();
  await options.getByRole('link', { name: 'Settings' }).click();
  const picker = options.getByRole('radiogroup', { name: 'Theme' });
  await expect(picker.getByRole('radio')).toHaveCount(3);
  // Each preview card shows its own theme, whatever the page's theme is.
  for (const id of THEMES) {
    await expect(options.locator(`.sl-theme-card[data-theme="${id}"]`)).toBeVisible();
  }

  await picker.getByRole('radio', { name: /Pastel/ }).check();
  await expect(options.locator('html')).toHaveAttribute('data-theme', 'pastel');
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'pastel'); // live
  expect(await background.get('ui:theme')).toBe('pastel');
  // The real colors change, not just the attribute.
  const primary = (page: Page) =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--sl-primary').trim(),
    );
  expect(await primary(options)).toBe('#3557d6');

  await picker.getByRole('radio', { name: /Ocean/ }).check();
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'ocean');
  expect(await primary(popup)).toBe('#2f5bd3');

  // Delete everything removes the setting, which means the default look.
  const myData = await openMyData();
  await myData.getByLabel('Type DELETE to confirm:').fill('DELETE');
  await myData.getByRole('button', { name: 'Delete everything' }).click();
  await expect(myData.getByText('Everything is deleted.')).toBeVisible();
  expect(await background.get('ui:theme')).toBeUndefined();
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'sunrise');
});

for (const theme of THEMES) {
  test(`no screen renders blank in the ${theme} theme`, async ({
    context,
    extensionId,
    background,
  }) => {
    await background.set({ 'ui:theme': theme, 'interventions:notice-seen': true });
    const base = `chrome-extension://${extensionId}`;
    const target = encodeURIComponent('https://www.youtube.com/watch?v=1');
    const screens: [string, RegExp][] = [
      ['popup.html', /Ready to focus\?/],
      ['options.html', /Site categories/],
      ['options.html#insights', /Insights/],
      ['options.html#settings', /Look/],
      ['options.html#my-data', /My Data/],
      ['welcome.html', /Pick your look/],
      [`interstitial.html?m=friction&to=${target}&s=x`, /A moment before/],
      [`interstitial.html?m=intention&to=${target}&s=x`, /What did you come here for\?/],
      ['interstitial.html?done=1&s=x', /Nice save!/],
    ];
    for (const [path, expected] of screens) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(`${base}/${path}`);
      await expect(page.locator('html'), path).toHaveAttribute('data-theme', theme);
      await expect(page.getByText(expected).first(), path).toBeVisible();
      const body = await page.evaluate(() => ({
        text: document.body.innerText.trim().length,
        background: getComputedStyle(document.body).backgroundImage,
        color: getComputedStyle(document.body).color,
      }));
      expect(body.text, path).toBeGreaterThan(40);
      expect(body.background, path).toContain('gradient');
      expect(body.color, path).not.toBe('rgb(0, 0, 0)'); // the theme's ink, not the default
      expect(errors, path).toEqual([]);
      // FEEDBACK_URL is empty until the feedback form exists: the link is hidden everywhere.
      await expect(page.getByText('Send feedback'), path).toHaveCount(0);
      await page.close();
    }
  });
}
