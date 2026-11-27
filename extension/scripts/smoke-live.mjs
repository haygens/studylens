/**
 * Production check of live group sessions (P18b) with TWO browser profiles — replaces hs's manual
 * two-browser test. Run: `npm run smoke:live -w extension` (builds the normal Edge build first).
 *
 * Talks to the REAL server (https://studylens-flame.vercel.app) with the normal (non-E2E) Edge
 * build in the installed Microsoft Edge (headless, channel `msedge`; nothing is downloaded). Two
 * throwaway profiles in TEMP (on M:), deleted afterwards. Display names `smoke-A` / `smoke-B`; at
 * the end both delete their server data and the script checks that nothing is left.
 *
 * The build is copied to a temp folder with the store's key (so the copy gets the store ID that
 * production CORS accepts) and the server origin granted; see `store-id-copy.mjs`.
 *
 * Steps: A registers + creates a group; B joins by code (sharing focus minutes OFF); A starts a
 * 5-minute group session; B sees "Live session" in the popup and joins late; both have the same end
 * time and see each other focusing; B leaves ("Left early"); A ends early; the summary shows A's
 * minutes and "minutes not shared" for B; both delete their server data; the group and both
 * devices are gone.
 */
/* global chrome */
import { chromium, expect } from '@playwright/test';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { API, BUILD, STORE_ID, makeStoreIdCopy, tempDir } from './store-id-copy.mjs';

const RUN = Date.now().toString(36).slice(-5);
const GROUP = `smoke-${RUN}`;
const GOAL = 'smoke test, please ignore';

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(`${status === 'PASS' ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
/** Runs a step; after a failure the following steps are skipped (they depend on each other). */
let broken = false;
async function step(name, fn) {
  if (broken) return record(name, 'FAIL', 'skipped: an earlier step failed');
  try {
    record(name, 'PASS', (await fn()) ?? '');
  } catch (err) {
    broken = true;
    const msg = String(err?.message ?? err)
      .split('\n')
      .slice(0, 8)
      .join(' | ');
    record(name, 'FAIL', msg);
  }
}
/** Cleanup steps run even after a failure. */
async function always(name, fn) {
  try {
    record(name, 'PASS', (await fn()) ?? '');
  } catch (err) {
    record(
      name,
      'FAIL',
      String(err?.message ?? err)
        .split('\n')
        .slice(0, 6)
        .join(' | '),
    );
  }
}

/** Raw API call without an Origin header (like curl: no CORS involved). */
async function api(method, pathname, token, body) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, json };
}

// ---------- Prepare the extension copy ----------
if (!existsSync(path.join(BUILD, 'manifest.json'))) {
  console.error(`Build missing: ${BUILD}. Run \`npm run build:edge -w extension\`.`);
  process.exit(1);
}
const work = tempDir('studylens-live-');
const EXT = path.join(work, 'ext');
const profiles = [];
const contexts = [];
const tokens = {};

await step('extension copy: only the manifest differs from the normal Edge build', () => {
  const { files, version } = makeStoreIdCopy(EXT);
  return `${files} files identical; version ${version}`;
});

async function launch(label) {
  const profile = tempDir(`studylens-live-${label}-`);
  profiles.push(profile);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    reducedMotion: 'reduce', // P21: still frames, no half-faded screenshots
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
    ],
  });
  contexts.push(context);
  const errors = [];
  context.on('weberror', (e) => errors.push(`uncaught: ${e.error().message}`));
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  // Close the welcome page (a fresh install opens it).
  await expect
    .poll(() => context.pages().some((p) => p.url().includes('/welcome.html')), { timeout: 15_000 })
    .toBe(true);
  for (const p of context.pages()) if (p.url().includes('/welcome.html')) await p.close();
  const storage = () => context.serviceWorkers()[0].evaluate(() => chrome.storage.local.get(null));
  const open = async (pathAndHash) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/${pathAndHash}`);
    return page;
  };
  return { context, id, storage, open, errors };
}

const people = (page) =>
  page.getByRole('list', { name: `Participants in ${GROUP}` }).getByRole('listitem');

let A;
let B;
let tabA;
let tabB;
let popupA;
let popupB;
let code;
let liveId;

try {
  await step('two temporary Edge profiles load the extension with the store ID', async () => {
    A = await launch('a');
    B = await launch('b');
    expect(A.id).toBe(STORE_ID);
    expect(B.id).toBe(STORE_ID);
    // Research notice answered in the normal way ("Keep on") so solo sessions could start too.
    return `Edge ${A.context.browser()?.version() ?? ''} · ${profiles.join(', ')}`;
  });

  await step('server is up', async () => {
    const res = await api('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, db: 'up' });
    return `${API} version ${res.json.version}`;
  });

  await step('A registers as smoke-A and creates a group', async () => {
    tabA = await A.open('options.html#groups');
    await tabA.getByRole('button', { name: 'Join or create a group' }).click();
    await expect(tabA.getByRole('heading', { name: 'Create or join a group' })).toBeVisible();
    await tabA.getByLabel('Your display name').fill('smoke-A');
    await tabA.getByLabel('Group name').fill(GROUP);
    await tabA.getByRole('button', { name: 'Create group' }).click();
    const card = tabA.getByRole('region', { name: `Group ${GROUP}` });
    await expect(card).toBeVisible({ timeout: 20_000 });
    const text = await card.getByText(/^Join code:/).innerText();
    code = /([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(text)?.[1];
    expect(code).toBeTruthy();
    const stored = await A.storage();
    tokens.A = stored['groups:device'].token;
    expect(Object.values(stored['groups:sharing'])).toEqual([
      { focusMinutes: true, focusingNow: true },
    ]);
    return `group ${GROUP}, code ${code}, sharing both switches`;
  });

  await step('B joins by code as smoke-B with "Share my focus minutes" OFF', async () => {
    tabB = await B.open('options.html#groups');
    await tabB.getByRole('button', { name: 'Join or create a group' }).click();
    await expect(tabB.getByRole('heading', { name: 'Create or join a group' })).toBeVisible();
    await tabB.getByLabel(/Share my focus minutes/).uncheck();
    await tabB.getByLabel('Your display name').fill('smoke-B');
    await tabB.getByLabel('Join code').fill(code);
    await tabB.getByRole('button', { name: 'Join group' }).click();
    await expect(
      tabB.getByRole('list', { name: `Members of ${GROUP}` }).getByRole('listitem'),
    ).toHaveCount(2, { timeout: 20_000 });
    const stored = await B.storage();
    tokens.B = stored['groups:device'].token;
    expect(Object.values(stored['groups:sharing'])).toEqual([
      { focusMinutes: false, focusingNow: true },
    ]);
    return '2 members';
  });

  await step('A starts a 5-minute group session from the Study groups tab', async () => {
    await tabA.reload();
    const form = tabA.getByRole('form', { name: 'Start a group session' });
    await expect(form).toBeVisible({ timeout: 20_000 });
    // The normal build has no test-only length field.
    await expect(tabA.getByText(/E2E build only/)).toHaveCount(0);
    await form.getByLabel('Goal (optional, your group sees it)').fill(GOAL);
    await form.getByRole('radio', { name: 'Custom' }).check();
    await form.getByLabel('Custom group session length in minutes').fill('5');
    await form.getByRole('button', { name: 'Start group session' }).click();
    const card = tabA.getByRole('region', { name: `Live session in ${GROUP}` });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(people(tabA)).toHaveText(['smoke-A (you, started it) · Focusing']);
    const active = (await A.storage())['sessions:active'];
    expect(active).toMatchObject({ mode: 'group', condition: 'group', goal: GOAL });
    liveId = active.group.sessionId;
    const left = Math.round((active.plannedEnd - Date.now()) / 1000);
    expect(left).toBeGreaterThan(240);
    expect(left).toBeLessThanOrEqual(301);
    return `local session mode group, ~${left} s left`;
  });

  await step('B sees "Live session" in the popup and joins late', async () => {
    await new Promise((r) => setTimeout(r, 5_000)); // Join a little late on purpose.
    popupB = await B.open('popup.html');
    const line = popupB.getByRole('list', { name: 'Live group sessions' });
    await expect(line).toContainText(`Live session in ${GROUP}`, { timeout: 20_000 });
    await expect(line).toContainText(/min left/);
    await expect(line).toContainText(`Goal: ${GOAL}`);
    await popupB.getByRole('button', { name: `Join the live session in ${GROUP}` }).click();
    await expect(popupB.getByText(`Group session · ${GROUP}`)).toBeVisible({ timeout: 20_000 });
    const active = (await B.storage())['sessions:active'];
    expect(active).toMatchObject({ mode: 'group', condition: 'group' });
    expect(active.group.sessionId).toBe(liveId);
    return `joined; planned ${active.plannedMinutes} min (late joiner)`;
  });

  await step('both show the same end time and each other as focusing', async () => {
    const [a, b] = [(await A.storage())['sessions:active'], (await B.storage())['sessions:active']];
    const diff = Math.abs(a.plannedEnd - b.plannedEnd);
    expect(diff).toBeLessThan(2000);
    popupA = await A.open('popup.html');
    const endsA = await popupA.getByText(/^Ends at /).innerText();
    const endsB = await popupB.getByText(/^Ends at /).innerText();
    expect(endsA.split(' · ')[0]).toBe(endsB.split(' · ')[0]);
    await expect(people(popupA)).toHaveText(
      ['smoke-A (you, started it) · Focusing', 'smoke-B · Focusing'],
      { timeout: 20_000 },
    );
    await expect(people(popupB)).toHaveText([
      'smoke-A (started it) · Focusing',
      'smoke-B (you) · Focusing',
    ]);
    return `ends differ by ${diff} ms; "${endsA.split(' · ')[0]}" on both`;
  });

  await step('B leaves early → A sees "Left early"', async () => {
    await popupB.getByRole('button', { name: 'Leave session' }).click();
    await expect(popupB.getByRole('form', { name: 'Session check-in' })).toBeVisible({
      timeout: 20_000,
    });
    // The background tells the server; A's popup sees it on its next load.
    await expect(async () => {
      await popupA.reload();
      await expect(people(popupA)).toHaveText(
        ['smoke-A (you, started it) · Focusing', 'smoke-B · Left early · minutes not shared'],
        { timeout: 2_000 },
      );
    }).toPass({ timeout: 30_000, intervals: [1000, 2000, 3000] });
    const [last] = (await B.storage())['sessions:history'].slice(-1);
    expect(last).toMatchObject({ mode: 'group', condition: 'group', endedEarly: true });
    expect((await B.storage())['groups:live-pending-leave']).toBeUndefined();
    return 'status left, minutes not shared (B’s switch is off)';
  });

  await step('A ends early → the summary respects the sharing switches', async () => {
    await popupA.getByRole('button', { name: 'Leave session' }).click();
    const summary = popupA.getByRole('region', { name: `Group summary for ${GROUP}` });
    await expect(async () => {
      await popupA.reload();
      await expect(summary.getByText('Session complete!')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1000, 2000, 3000] });
    const rows = await people(popupA).allInnerTexts();
    expect(rows[0]).toMatch(/^smoke-A \(you, started it\) · Left early · \d+ min$/);
    expect(rows[1]).toBe('smoke-B · Left early · minutes not shared');
    await expect(summary).toContainText(GOAL);
    // B's own check-in screen shows the same summary.
    await popupB.reload();
    const bSummary = popupB.getByRole('region', { name: `Group summary for ${GROUP}` });
    await expect(bSummary.getByText('Session complete!')).toBeVisible({ timeout: 20_000 });
    // Check-ins stay local: nothing about them on the server.
    const state = await api('GET', `/api/group-sessions/${liveId}`, tokens.A);
    expect(state.status).toBe(200);
    expect(JSON.stringify(state.json)).not.toMatch(/checkIn|condition|hostname|url/i);
    expect(state.json.session.state).toBe('ended');
    return rows.join(' | ');
  });
} finally {
  // ---------- Cleanup: always delete server data, then local profiles ----------
  for (const [label, person] of [
    ['B', () => B],
    ['A', () => A],
  ]) {
    await always(`${label} deletes its group data from the server (in the extension)`, async () => {
      const p = person();
      if (!p) return 'not started';
      const tab = await p.open('options.html#groups');
      await tab.getByRole('button', { name: 'Delete my group data from the server' }).click();
      await tab.getByRole('button', { name: 'Yes, delete' }).click();
      await expect(
        tab.getByText(/Your group data was deleted from the StudyLens server/),
      ).toBeVisible({ timeout: 20_000 });
      const stored = await p.storage();
      expect(stored['groups:device']).toBeUndefined();
      expect(stored['groups:pending-server-delete']).toBeUndefined();
      return 'deleted; local registration removed';
    });
  }

  await always('nothing is left on the server (devices, group, live session)', async () => {
    const checked = [];
    // Both devices: their tokens no longer work.
    for (const [label, token] of Object.entries(tokens)) {
      const res = await api('GET', '/api/groups', token);
      expect(res.status, `device ${label}`).toBe(401);
      checked.push(`${label} token 401`);
    }
    if (code) {
      // The group: a fresh device can't find its code; then that device deletes itself.
      const reg = await api('POST', '/api/devices', undefined, { displayName: 'smoke-check' });
      expect(reg.status).toBe(201);
      try {
        const join = await api('POST', '/api/groups/join', reg.json.token, { code });
        expect(join.status).toBe(404);
        checked.push('group code 404');
        if (liveId) {
          const live = await api('GET', `/api/group-sessions/${liveId}`, reg.json.token);
          expect(live.status).toBe(404);
          checked.push('live session 404');
        }
      } finally {
        const del = await api('DELETE', '/api/devices/me', reg.json.token);
        expect(del.status).toBe(200);
        checked.push('smoke-check device deleted');
      }
    }
    return checked.join(', ');
  });

  await always('no uncaught errors in the extension pages', () => {
    expect([...(A?.errors ?? []), ...(B?.errors ?? [])]).toEqual([]);
  });

  for (const c of contexts) await c.close().catch(() => undefined);
  await always('temporary profiles and extension copy deleted', () => {
    for (const dir of [...profiles, work])
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    const left = [...profiles, work].filter((d) => existsSync(d));
    expect(left).toEqual([]);
    return `${profiles.length + 1} folders removed`;
  });
}

const failed = results.filter((r) => r.status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed (production server ${API})`);
process.exit(failed ? 1 : 0);
