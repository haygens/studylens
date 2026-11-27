/**
 * End-to-end: the web companion (P18c) on the local web server (playwright.config.ts starts it).
 * Landing page, /privacy (rendered from PRIVACY.md), and a live room: a group session started
 * through the API, opened at /s/<code> on a phone-sized screen, with the shared timer and the
 * participants; unknown codes show only a short message. Automated accessibility checks (axe,
 * WCAG 2.1 A + AA) on the landing page and the room.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { E2E_API_BASE } from '../server-urls';
import { expect, test } from './fixtures';

const WEB = E2E_API_BASE;

/** The few answer fields this test reads. */
interface Answer {
  token: string;
  group: { id: string; joinCode: string };
  session: { id: string; roomCode: string };
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${WEB}${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Answer };
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

test('landing page: install buttons, screenshots, privacy promise, no third parties, accessible', async ({
  context,
}) => {
  const page = await context.newPage();
  const offSite: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(WEB)) offSite.push(r.url());
  });
  const res = await page.goto(`${WEB}/`);
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Focus sessions that respect your privacy.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Install for Firefox' })).toHaveAttribute(
    'href',
    'https://addons.mozilla.org/en-US/firefox/addon/studylens/',
  );
  await expect(page.getByRole('link', { name: 'Install for Edge' })).toHaveAttribute(
    'href',
    'https://microsoftedge.microsoft.com/addons/detail/studylens/phepgpemnllainhhjemgknaeedjjekad',
  );
  await expect(page.getByRole('heading', { name: 'Your browsing stays yours' })).toBeVisible();
  // All 4 screenshots load (scroll so the lazy ones load too).
  const shots = page.locator('.shots img');
  await expect(shots).toHaveCount(4);
  for (const img of await shots.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1280);
  }
  // No cookies, nothing requested from other sites.
  expect(await context.cookies(WEB)).toEqual([]);
  expect(offSite).toEqual([]);
  await expectNoAxeViolations(page);

  // Wide screen: the full screenshots. (Lazy images have no currentSrc until they load: load all.)
  await page.locator('.shots img').evaluateAll((imgs) => {
    for (const img of imgs) (img as HTMLImageElement).loading = 'eager';
  });
  const shotSrcs = () =>
    page
      .locator('.shots img')
      .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).currentSrc));
  await expect
    .poll(async () => (await shotSrcs()).filter((src) => /\/media\/[a-z-]+\.png$/.test(src)))
    .toEqual([
      `${WEB}/media/focus-session.png`,
      `${WEB}/media/friction-countdown.png`,
      `${WEB}/media/intention-question.png`,
      `${WEB}/media/insights.png`,
    ]);

  // Narrow phone (360 px): no horizontal scrolling, nothing sticks out past the screen, and the
  // header links sit fully inside the side gutter (no "GitHub" cut off at the edge).
  await page.setViewportSize({ width: 360, height: 740 });
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const outside = [...document.querySelectorAll('body *')]
      .filter((el) => !el.matches('.skip')) // the skip link is off-screen until focused
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && (box.right > width + 0.5 || box.left < -0.5);
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
    const links = [...document.querySelectorAll('header a:not(.skip)')].map((a) => {
      const box = a.getBoundingClientRect();
      return { text: a.textContent, left: box.left, right: box.right };
    });
    return {
      overflow: document.documentElement.scrollWidth - width,
      outside,
      links,
      width,
    };
  });
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.outside).toEqual([]);
  expect(layout.links.map((l) => l.text)).toEqual(['StudyLens', 'Privacy', 'GitHub']);
  for (const link of layout.links) {
    expect(link.left).toBeGreaterThanOrEqual(12);
    expect(link.right).toBeLessThanOrEqual(layout.width - 12);
  }
  // Phones get the tighter crops (same alt text).
  await expect
    .poll(shotSrcs)
    .toEqual([
      `${WEB}/media/phone-focus-session.png`,
      `${WEB}/media/phone-friction-countdown.png`,
      `${WEB}/media/phone-intention-question.png`,
      `${WEB}/media/phone-insights.png`,
    ]);
  await expect(page.locator('.shots img').first()).toHaveAttribute('alt', /popup/);

  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page).toHaveURL(`${WEB}/privacy`);
});

test('/privacy renders PRIVACY.md', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${WEB}/privacy`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'StudyLens Privacy Policy' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /Live group sessions/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Study groups/ }).first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test('live room: shared timer and participants on a phone; unknown codes show nothing', async ({
  context,
}) => {
  // A group session started through the API (two devices; the second one joins).
  const sam = (await api('POST', '/api/devices', undefined, { displayName: 'Room Sam' })).json;
  const alex = (await api('POST', '/api/devices', undefined, { displayName: 'Room Alex' })).json;
  const group = (
    await api('POST', '/api/groups', sam.token, {
      name: 'Room Chem',
      sharing: { focusMinutes: true, focusingNow: true },
    })
  ).json.group;
  await api('POST', '/api/groups/join', alex.token, { code: group.joinCode });
  const started = await api('POST', `/api/groups/${group.id}/sessions`, sam.token, {
    goal: 'Chapter 4',
    minutes: 25,
  });
  expect(started.status).toBe(201);
  const { id, roomCode } = started.json.session;
  expect(roomCode).toMatch(/^[A-Z2-9]{16}$/);
  await api('POST', `/api/group-sessions/${id}/join`, alex.token);

  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 740 });
  const res = await page.goto(`${WEB}/s/${roomCode}`);
  expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
  expect(res?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  await expect(page.getByRole('heading', { level: 1, name: 'Room Chem' })).toBeVisible();
  await expect(page.getByText('Goal: Chapter 4')).toBeVisible();
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText(/^2[45]:\d\d$/);
  const first = await timer.innerText();
  await expect.poll(() => timer.innerText(), { timeout: 5_000 }).not.toBe(first); // it ticks
  const people = page
    .getByRole('list', { name: 'Participants in Room Chem' })
    .getByRole('listitem');
  await expect(people).toHaveText([
    /^Room Sam \(started it\)\s*Focusing$/,
    /^Room Alex\s*Focusing$/,
  ]);
  await expectNoAxeViolations(page);

  // Alex leaves: the room shows it after a refresh.
  await api('POST', `/api/group-sessions/${id}/leave`, alex.token);
  await page.reload();
  await expect(people.nth(1)).toHaveText(/^Room Alex\s*Left early$/);

  // Unknown (or expired) codes: only a short message.
  await page.goto(`${WEB}/s/ZZZZZZZZZZZZZZZZ`);
  await expect(
    page.getByRole('heading', { name: 'This room link has expired or doesn’t exist.' }),
  ).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);

  // Clean up the test devices.
  await api('DELETE', '/api/devices/me', alex.token);
  await api('DELETE', '/api/devices/me', sam.token);
});
