/**
 * End-to-end: study groups (P16), against a local copy of the real web API (started by
 * playwright.config.ts, see web-server.ts) with its own fresh database file.
 *
 * Note on the permission prompt: Playwright can't click the browser's own permission dialog, so
 * the E2E build gets the local test server as a host permission at install, and its
 * `permissions.request()` then resolves without a dialog. The normal build is checked separately
 * below: no host permission at install, the server only as an optional permission, and solo use
 * never contacts it.
 */
import { readFileSync } from 'node:fs';
import { E2E_API_BASE, PRODUCTION_API_BASE } from '../server-urls';
import { expect, launchExtension, startSession, test } from './fixtures';
import { countRequests, joinCodeOf, members, row, startGroups } from './group-helpers';

test.describe('normal build (production server)', () => {
  test.use({ build: 'normal' });

  test('solo user: no host permission, only an optional one, and nothing is sent', async ({
    context,
    background,
    openOptions,
    openPopup,
  }) => {
    const sent = countRequests(context, PRODUCTION_API_BASE);
    const manifest = JSON.parse(
      readFileSync(new URL('../.output/edge-mv3/manifest.json', import.meta.url), 'utf8'),
    ) as { host_permissions?: string[]; optional_host_permissions?: string[] };
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual([`${PRODUCTION_API_BASE}/*`]);
    expect((await background.permissions()).origins ?? []).toEqual([]);

    const popup = await openPopup();
    await expect(popup.getByRole('button', { name: 'Study groups' })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Start focus session' })).toBeVisible();

    const options = await openOptions();
    await options.getByRole('link', { name: 'Study groups' }).click();
    await expect(options.getByRole('button', { name: 'Join or create a group' })).toBeVisible();
    await expect(options.getByText('Nothing has been sent.')).toBeVisible();

    expect((await background.permissions()).origins ?? []).toEqual([]);
    expect(sent()).toBe(0);
  });
});

test('solo use never contacts the server (sessions, every tab, Delete everything)', async ({
  context,
  background,
  openPopup,
  openOptions,
  openMyData,
}) => {
  const sent = countRequests(context, E2E_API_BASE);
  const popup = await openPopup();
  await startSession(popup, 'Solo work', 300);
  const options = await openOptions();
  for (const tab of ['Insights', 'Study groups', 'Settings', 'My Data', 'Site categories']) {
    await options.getByRole('link', { name: tab }).click();
    await expect(options.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
  const myData = await openMyData();
  await myData.getByLabel('Type DELETE to confirm:').fill('DELETE');
  await myData.getByRole('button', { name: 'Delete everything' }).click();
  await expect(myData.getByText('Everything is deleted.')).toBeVisible();
  await expect(myData.getByText(/study group data/)).toHaveCount(0);
  expect(await background.get('groups:device')).toBeUndefined();
  expect(sent()).toBe(0);
});

test('create → a second person joins by code → both see each other → leave → delete server data', async ({
  headless,
  context,
  openOptions,
  openMyData,
  background,
  request,
}) => {
  // Proves the counter sees the extension's requests, so "0 requests" in the solo tests means
  // something.
  const sent = countRequests(context, E2E_API_BASE);
  // Person A creates a group.
  const a = await openOptions();
  await a.goto(a.url().replace(/#.*$/, '') + '#groups');
  await startGroups(a);
  await a.getByLabel('Your display name').fill('Sam');
  await a.getByLabel('Group name').fill('E2E Study');
  await a.getByRole('button', { name: 'Create group' }).click();
  await expect(a.getByRole('status').filter({ hasText: 'You created “E2E Study”' })).toBeVisible();
  await expect(members(a, 'E2E Study')).toHaveText([row('Sam (you) · started the group')]);
  const code = await joinCodeOf(a, 'E2E Study');
  const device = await background.get<{ deviceId: string; token: string; displayName: string }>(
    'groups:device',
  );
  expect(device).toMatchObject({ displayName: 'Sam', token: expect.stringMatching(/^slt_/) });

  // The invite message has the code (copied, or shown to copy by hand without clipboard access).
  await a.getByRole('button', { name: 'Copy invite message' }).click();
  const manual = a.getByLabel('Invite message');
  const copied = a.getByText('Invite message copied.');
  await expect(manual.or(copied)).toBeVisible();
  if (await manual.isVisible()) await expect(manual).toHaveValue(new RegExp(`Join code: ${code}`));

  // Person B, in a separate browser profile, joins with the code typed in lowercase.
  const personB = await launchExtension(headless);
  try {
    const b = await personB.open('options.html#groups');
    await startGroups(b);
    await b.getByLabel('Your display name').fill('Alex');
    await b.getByLabel('Join code').fill(code.toLowerCase());
    await b.getByRole('button', { name: 'Join group' }).click();
    await expect(b.getByRole('status').filter({ hasText: 'You joined “E2E Study”' })).toBeVisible();
    await expect(members(b, 'E2E Study')).toHaveText([
      row('Sam · started the group'),
      row('Alex (you)'),
    ]);

    // A sees B after refreshing.
    await a.getByRole('button', { name: 'Refresh' }).click();
    await expect(members(a, 'E2E Study')).toHaveText([
      row('Sam (you) · started the group'),
      row('Alex'),
    ]);

    // B leaves; A no longer sees B.
    await b.getByRole('button', { name: 'Leave group' }).click();
    await b.getByRole('button', { name: 'Yes, leave' }).click();
    await expect(b.getByText('You left “E2E Study”.')).toBeVisible();
    await expect(b.getByText('You’re not in any group right now.')).toBeVisible();
    await a.getByRole('button', { name: 'Refresh' }).click();
    await expect(members(a, 'E2E Study')).toHaveText([row('Sam (you) · started the group')]);

    // B deletes their group data from the server: back to the start screen, token gone.
    await b.getByRole('button', { name: 'Delete my group data from the server' }).click();
    await b.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(
      b.getByText(/Your group data was deleted from the StudyLens server/),
    ).toBeVisible();
    await expect(b.getByRole('button', { name: 'Join or create a group' })).toBeVisible();
    expect(await personB.background.get('groups:device')).toBeUndefined();
  } finally {
    await personB.close();
  }

  // A uses "Delete everything" on My Data: the server copy goes too.
  const myData = await openMyData();
  await expect(myData.getByRole('heading', { name: 'Study groups' })).toBeVisible();
  await expect(myData.getByText(/\(hidden\)/)).toBeVisible();
  await expect(myData.getByText(device.token)).toHaveCount(0);
  await myData.getByLabel('Type DELETE to confirm:').fill('DELETE');
  await myData.getByRole('button', { name: 'Delete everything' }).click();
  await expect(
    myData.getByText(/study group data was also deleted from the StudyLens server/),
  ).toBeVisible();
  expect(await background.get('groups:device')).toBeUndefined();
  expect(await background.get('groups:pending-server-delete')).toBeUndefined();

  expect(sent()).toBeGreaterThan(5);

  // The server agrees: A's token no longer works (so A's data is gone).
  const res = await request.get(`${E2E_API_BASE}/api/groups`, {
    headers: { authorization: `Bearer ${device.token}` },
  });
  expect(res.status()).toBe(401);
});

test('server down: clear error with Retry, solo features keep working, Delete everything still deletes', async ({
  context,
  openOptions,
  openPopup,
  openMyData,
  background,
}) => {
  const page = await openOptions();
  await page.goto(page.url().replace(/#.*$/, '') + '#groups');
  await startGroups(page);
  await page.getByLabel('Your display name').fill('Sam');
  await page.getByLabel('Group name').fill('Offline test');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(members(page, 'Offline test')).toHaveCount(1);

  // The server goes away.
  await context.route(`${E2E_API_BASE}/**`, (route) => route.abort('connectionrefused'));
  await page.getByRole('button', { name: 'Refresh' }).click();
  const error = page.getByRole('alert', { name: 'Groups could not load' });
  await expect(error).toContainText('Can’t reach the StudyLens server');
  await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your display name' })).toBeVisible();

  // Solo features don't care.
  const popup = await openPopup();
  await startSession(popup, 'Still works', 300);

  // Back online: Retry shows the group again.
  await context.unroute(`${E2E_API_BASE}/**`);
  await error.getByRole('button', { name: 'Retry' }).click();
  await expect(members(page, 'Offline test')).toHaveCount(1);

  // Offline again, then Delete everything: local data is deleted anyway, the user is told, and
  // only the token for finishing the server delete is kept.
  await context.route(`${E2E_API_BASE}/**`, (route) => route.abort('connectionrefused'));
  const myData = await openMyData();
  await myData.getByLabel('Type DELETE to confirm:').fill('DELETE');
  await myData.getByRole('button', { name: 'Delete everything' }).click();
  await expect(myData.getByText('Everything is deleted.')).toBeVisible();
  await expect(
    myData.getByText(/couldn’t delete your study group data on its server/),
  ).toBeVisible();
  await expect(myData.getByText(/will try again automatically/)).toBeVisible();
  const left = await background.storage();
  expect(
    Object.keys(left)
      .filter((k) => k !== 'tracker:state')
      .sort(),
  ).toEqual(['groups:pending-server-delete']);
  expect(left['groups:pending-server-delete']).toMatchObject({
    token: expect.stringMatching(/^slt_/),
  });
});
