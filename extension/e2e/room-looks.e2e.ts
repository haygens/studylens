/**
 * End-to-end: the live room's three looks (P21) on the local web server. A group session is
 * started through the API, then the room page is opened with each look:
 *  - the theme → look mapping arrives as ?look= / #look= (Hearth, Rainy Window, Corner Café),
 *  - unknown values (and no value) fall back to the café,
 *  - the "Room look" switcher wins over the link and survives a reload,
 *  - the look never reaches the server when it comes in the fragment (what the extension uses),
 *    and ?look= is removed from the address bar,
 *  - no horizontal overflow at 390 px in any look, and axe WCAG 2.1 AA passes in each look.
 *
 * With STUDYLENS_LOOK_SHOTS=1 (see scripts/room-look-shots.mjs) it also saves screenshots of
 * every look at 390 px and 1280 px to docs/store/screenshots/looks/.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_API_BASE } from '../server-urls';
import { expect, test } from './fixtures';

const WEB = E2E_API_BASE;
const SHOTS = process.env.STUDYLENS_LOOK_SHOTS === '1';
const SHOT_DIR = fileURLToPath(new URL('../../docs/store/screenshots/looks/', import.meta.url));

const LOOKS = {
  hearth: { pill: 'Live by the fire', list: 'Around the fire', name: 'Hearth' },
  cafe: { pill: 'Café open · live', list: 'At the table', name: 'Corner Café' },
  rainy: { pill: 'Live · quiet hours', list: 'Lamps on', name: 'Rainy Window' },
} as const;
type Look = keyof typeof LOOKS;

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
  return (await res.json()) as Answer;
}

/** A running 50-minute session with two people (Kim and Ana), returns the room code. */
async function demoRoom(): Promise<string> {
  const kim = await api('POST', '/api/devices', undefined, { displayName: 'Kim' });
  const ana = await api('POST', '/api/devices', undefined, { displayName: 'Ana' });
  const { group } = await api('POST', '/api/groups', kim.token, {
    name: 'Chem study crew',
    sharing: { focusMinutes: true, focusingNow: true },
  });
  await api('POST', '/api/groups/join', ana.token, { code: group.joinCode });
  const started = await api('POST', `/api/groups/${group.id}/sessions`, kim.token, {
    goal: 'Finish chapter 4 problems',
    minutes: 50,
  });
  await api('POST', `/api/group-sessions/${started.session.id}/join`, ana.token);
  return started.session.roomCode;
}

async function open(page: Page, url: string) {
  await page.goto('about:blank'); // a hash-only change wouldn't reload the page
  await page.goto(url);
  await expect(page.getByRole('timer')).toBeVisible();
}

async function expectLook(page: Page, look: Look) {
  await expect(page.locator('html')).toHaveAttribute('data-look', look);
  await expect(page.locator('.room-pill')).toHaveText(`●${LOOKS[look].pill}`);
  await expect(page.getByRole('heading', { level: 2, name: LOOKS[look].list })).toBeVisible();
  await expect(page.getByRole('button', { name: LOOKS[look].name })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Only that look's scene is shown; scenes are hidden from screen readers.
  await expect(page.locator(`.scene-${look}`)).toBeVisible();
  await expect(page.locator('.room-scene')).toHaveAttribute('aria-hidden', 'true');
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('room looks: link → look, fallback, switcher persists, no overflow, accessible', async ({
  context,
}) => {
  const code = await demoRoom();
  const room = `${WEB}/s/${code}`;
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  // The extension's mapping (Sunrise → hearth, Ocean → rainy, Pastel → cafe) arrives as ?look=.
  for (const look of ['hearth', 'rainy', 'cafe'] as const) {
    await open(page, `${room}?look=${look}`);
    await expectLook(page, look);
    await expect(page).toHaveURL(room); // ?look= is removed from the address bar
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => `${look} ${v.id}`)).toEqual([]);
  }

  // The fragment (what the extension sends) never reaches the server.
  requests.length = 0;
  await open(page, `${room}#look=rainy`);
  await expectLook(page, 'rainy');
  expect(requests.filter((u) => u.startsWith(WEB) && /look/i.test(u))).toEqual([]);

  // Unknown values and no value: the café.
  for (const url of [`${room}?look=disco`, `${room}#look=__proto__`, room]) {
    await open(page, url);
    await expectLook(page, 'cafe');
  }

  // The switcher (keyboard) overrides the link and survives a reload.
  await open(page, `${room}?look=rainy`);
  await page.getByRole('button', { name: 'Hearth' }).focus();
  await page.keyboard.press('Enter');
  await expectLook(page, 'hearth');
  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible();
  await expectLook(page, 'hearth');
  await open(page, `${room}#look=cafe`);
  await expectLook(page, 'hearth');
  expect(await page.evaluate(() => localStorage.getItem('studylens.roomLook'))).toBe('hearth');

  // Same content in every look; status words stay.
  await expect(
    page.getByRole('list', { name: 'Participants in Chem study crew' }).getByRole('listitem'),
  ).toHaveText([/^Kim \(started it\)\s*Focusing$/, /^Ana\s*Focusing$/]);
  await expect(page.getByRole('link', { name: 'About StudyLens' })).toBeVisible();

  if (SHOTS) {
    for (const [width, height] of [
      [390, 844],
      [1280, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const look of ['hearth', 'cafe', 'rainy'] as const) {
        await page.getByRole('button', { name: LOOKS[look].name }).click();
        await expectLook(page, look);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `${SHOT_DIR}${width === 390 ? 'phone' : 'desktop'}-${look}.png`,
          fullPage: width === 390,
        });
      }
    }
  }
});

test('room looks: storage blocked still works (falls back silently)', async ({ context }) => {
  const code = await demoRoom();
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, `${WEB}/s/${code}#look=rainy`);
  await expectLook(page, 'rainy');
  await page.getByRole('button', { name: 'Corner Café' }).click();
  await expectLook(page, 'cafe');
  expect(errors).toEqual([]);
});
