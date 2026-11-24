/** Shared steps for the study group E2E tests (P16, P18). */
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from './fixtures';

/** Counts every request the extension's pages make to `base` (optionally only one path). */
export function countRequests(context: BrowserContext, base: string, path = ''): () => number {
  let n = 0;
  context.on('request', (r) => {
    if (r.url().startsWith(base + path)) n++;
  });
  return () => n;
}

/** Consent screen → "Join or create a group" → the create/join forms. */
export async function startGroups(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Study groups', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What a study group shares' })).toBeVisible();
  await expect(page.getByText('Never shared:')).toBeVisible();
  await page.getByRole('button', { name: 'Join or create a group' }).click();
  await expect(page.getByRole('heading', { name: 'Create or join a group' })).toBeVisible();
}

/** The join code shown on a group card, e.g. `ABCD-EFGH`. */
export async function joinCodeOf(page: Page, groupName: string): Promise<string> {
  const card = page.getByRole('region', { name: `Group ${groupName}` });
  const text = await card.getByText(/^Join code:/).innerText();
  const code = /([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(text)?.[1];
  if (!code) throw new Error(`No join code in "${text}"`);
  return code;
}

export const members = (page: Page, groupName: string) =>
  page.getByRole('list', { name: `Members of ${groupName}` }).getByRole('listitem');

/**
 * A member row starting with `start` ("Sam (you) · started the group"), followed by nothing or
 * by the P18 activity (" · 30 min focused today …").
 */
export function row(start: string): RegExp {
  return new RegExp(`^${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( · |$)`);
}
