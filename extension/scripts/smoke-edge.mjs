/**
 * Production-build smoke test on Edge (replaces the manual Edge check before store submission).
 * Run: `npm run smoke:edge -w extension` (builds the normal Edge build first).
 *
 * Loads the REAL production build (`.output/edge-mv3`, the files that go into
 * `studylens-0.3.0-edge.zip`) in the installed Microsoft Edge (channel `msedge`, headless). No
 * browser is downloaded. The profile is a throwaway folder in TEMP (on M:) and is deleted
 * afterwards. All http(s) requests get tiny local stub pages or are blocked: nothing touches the
 * internet.
 *
 * Separate from the E2E suite on purpose: no test-only code, no storage seeding, a fresh install.
 *
 * Checks:
 *  1. Manifest: version, permissions (storage/tabs/idle/alarms only), no host permissions, no
 *     test-only code; the build folder has the same files as the Edge zip (if the zip exists).
 *  2. The welcome page opens once on install (Sunrise theme), and when it is closed early the
 *     popup's research notice shows and blocks Start until "Keep on".
 *  3. A 25-min session starts, the badge shows minutes, End early shows the check-in.
 *  4. Visiting a stub site records it in the popup's Today list.
 *  5. The options tabs (Site categories, Insights, Settings, My Data) render without errors.
 *  6. No console errors or uncaught errors from the extension.
 *
 * Note: the production build stops counting time when the PC has had no input for 60 seconds
 * (`idle`). If the PC is idle when check 4 runs, it is reported as SKIPPED, not failed.
 */
// Callbacks passed to `evaluate` run inside the extension's service worker, where `chrome` exists.
/* global chrome */
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTENSION_DIR = path.join(ROOT, '.output', 'edge-mv3');
const VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const ZIP = path.join(ROOT, '.output', `studylens-${VERSION}-edge.zip`);
const EXPECTED_PERMISSIONS = ['alarms', 'idle', 'storage', 'tabs'];
const TEST_ONLY_MARKERS = [
  'studylens-e2e-build',
  'E2E test build',
  'testSeconds',
  'E2E build only',
];
const STUB_SITES = { 'en.wikipedia.org': 'Wikipedia (stub)' };

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(
    `${status === 'PASS' ? '✓' : status === 'SKIP' ? '–' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`,
  );
}
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, detail?.skip ? 'SKIP' : 'PASS', detail?.skip ?? detail ?? '');
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

function filesIn(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        out.set(
          path.relative(dir, full).split(path.sep).join('/'),
          createHash('sha256').update(readFileSync(full)).digest('hex'),
        );
    }
  };
  walk(dir);
  return out;
}

/** Temp folders must not be on C: (CLAUDE.md: keep caches and profiles off C:). */
function tempDir(prefix) {
  const base = os.tmpdir();
  if (/^c:/i.test(base)) throw new Error(`TEMP is on C: (${base}); point TEMP/TMP to M: first.`);
  return mkdtempSync(path.join(base, prefix));
}

// ---------- 1. Static checks on the build ----------
if (!existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
  console.error(`Build missing: ${EXTENSION_DIR}. Run \`npm run build:edge -w extension\`.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
const buildFiles = filesIn(EXTENSION_DIR);

await check(`manifest: version ${VERSION}, MV3, service worker`, () => {
  expect(manifest.version).toBe(VERSION);
  expect(manifest.version).toBe('0.3.0');
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.background?.service_worker).toBeTruthy();
  expect(manifest.browser_specific_settings).toBeUndefined();
  return `version ${manifest.version}`;
});
await check('manifest: permissions are only storage/tabs/idle/alarms', () => {
  expect([...(manifest.permissions ?? [])].sort()).toEqual(EXPECTED_PERMISSIONS);
  expect(manifest.host_permissions ?? []).toEqual([]);
  expect(manifest.optional_permissions ?? []).toEqual([]);
  expect(manifest.optional_host_permissions ?? []).toEqual([]);
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect(manifest.incognito).toBe('not_allowed');
  return manifest.permissions.join(', ');
});
await check('build: no test-only code', () => {
  const found = [];
  for (const file of buildFiles.keys()) {
    const text = readFileSync(path.join(EXTENSION_DIR, file), 'latin1');
    for (const marker of TEST_ONLY_MARKERS)
      if (text.includes(marker)) found.push(`${file}: ${marker}`);
  }
  expect(found).toEqual([]);
  return `${buildFiles.size} files scanned`;
});
await check('build: same files as the Edge zip', () => {
  if (!existsSync(ZIP)) return { skip: `${path.basename(ZIP)} not built yet (npm run zip:edge)` };
  const dir = tempDir('studylens-smoke-zip-');
  try {
    // Windows 10+ ships bsdtar, which can read zip files. Use it by full path: Git for Windows'
    // GNU tar (often first on PATH in Git Bash) can't.
    const winTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(existsSync(winTar) ? winTar : 'tar', ['-xf', ZIP, '-C', dir]);
    expect(Object.fromEntries(filesIn(dir))).toEqual(Object.fromEntries(buildFiles));
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
  return `${buildFiles.size} files, identical SHA-256`;
});

// ---------- 2–6. In the browser ----------
const profile = tempDir('studylens-smoke-');
const extensionErrors = [];
const context = await chromium.launchPersistentContext(profile, {
  channel: 'msedge',
  headless: true,
  args: [
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
  ],
});

try {
  await context.route(/^https?:\/\//, (route) => {
    const title = STUB_SITES[new URL(route.request().url()).hostname];
    if (!title) return route.abort('blockedbyclient');
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>${title}</title><h1>${title}</h1>`,
    });
  });

  // Console errors from extension pages and the service worker.
  const isExtension = (url) => url?.startsWith('chrome-extension://');
  context.on('console', (msg) => {
    if (msg.type() === 'error' && isExtension(msg.location()?.url ?? msg.page()?.url()))
      extensionErrors.push(`console: ${msg.text()}`);
  });
  context.on('weberror', (e) => {
    if (isExtension(e.page()?.url())) extensionErrors.push(`uncaught: ${e.error().message}`);
  });

  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  sw.on('console', (msg) => {
    if (msg.type() === 'error') extensionErrors.push(`service worker: ${msg.text()}`);
  });
  const extensionId = new URL(sw.url()).host;
  const inWorker = (fn, arg) => context.serviceWorkers()[0].evaluate(fn, arg);
  const badge = () => inWorker(() => chrome.action.getBadgeText({}));
  const storage = () => inWorker(() => chrome.storage.local.get(null));
  const openPopup = async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    return page;
  };

  await check('loaded in Edge', async () => {
    const version = context.browser()?.version() ?? '(persistent context)';
    return `extension id ${extensionId}, Edge ${version}`;
  });

  await check('welcome page opens on install (Sunrise by default)', async () => {
    const isWelcome = (page) => page.url().includes('/welcome.html');
    await expect.poll(() => context.pages().some(isWelcome), { timeout: 15_000 }).toBe(true);
    const welcome = context.pages().find(isWelcome);
    await expect(welcome.getByRole('heading', { name: 'Pick your look' })).toBeVisible();
    await expect(welcome.locator('html')).toHaveAttribute('data-theme', 'sunrise');
    await welcome.close(); // Closed early: the popup must still ask the research question.
    return 'Pick your look, Step 1 of 3';
  });

  let popup;
  await check('research notice shows and blocks Start until "Keep on"', async () => {
    popup = await openPopup();
    await expect(popup.getByLabel('Test length in seconds (E2E build only)')).toHaveCount(0);
    const notice = popup.getByRole('dialog', { name: 'Research interventions' });
    await expect(notice).toBeVisible();
    await popup.getByLabel('What will you work on?').fill('Smoke test reading');
    const start = popup.getByRole('button', { name: 'Start focus session' });
    await expect(start).toBeDisabled();
    await notice.getByRole('button', { name: 'Keep on' }).click();
    await expect(notice).toHaveCount(0);
    await expect(start).toBeEnabled();
  });

  await check('25-min session starts and the badge shows minutes', async () => {
    await popup.getByRole('radio', { name: '25 min' }).check();
    await popup.getByRole('button', { name: 'Start focus session' }).click();
    await expect(popup.getByText('Focusing on')).toBeVisible();
    const { 'sessions:active': active } = await storage();
    expect(active).toMatchObject({ goal: 'Smoke test reading', plannedMinutes: 25 });
    expect(['control', 'friction', 'intention']).toContain(active.condition);
    await expect.poll(badge).toMatch(/^(25|24)$/);
    return `badge "${await badge()}", condition ${active.condition}`;
  });

  await check('visiting a stub site records it in Today', async () => {
    const idle = await inWorker(() => chrome.idle.queryState(60));
    if (idle !== 'active') return { skip: `PC is ${idle} (no input for 60 s), so tracking is off` };
    const site = await context.newPage();
    await site.goto('https://en.wikipedia.org/wiki/Focus');
    await site.waitForTimeout(5_000);
    await site.bringToFront();
    const today = await openPopup(); // Switching tabs ends the wikipedia segment.
    await expect(today.getByRole('row', { name: /wikipedia\.org/ })).toBeVisible({
      timeout: 15_000,
    });
    const row = (await today.getByRole('row', { name: /wikipedia\.org/ }).innerText()).trim();
    await today.close();
    await site.close();
    const raw = JSON.stringify(await storage());
    expect(raw).not.toContain('/wiki/Focus'); // Domains only.
    return row.replace(/\s+/g, ' ');
  });

  await check('End early shows the check-in', async () => {
    await popup.reload();
    await popup.getByRole('button', { name: 'End early' }).click();
    await expect(popup.getByRole('form', { name: 'Session check-in' })).toBeVisible();
    await expect.poll(badge).toBe('?');
    const { 'sessions:history': history } = await storage();
    expect(history.at(-1)).toMatchObject({ endedEarly: true, checkIn: null });
    return 'badge "?"';
  });

  await check('options tabs render without errors', async () => {
    const page = await context.newPage();
    const tabs = [
      ['categories', 'Site categories'],
      ['insights', 'Insights'],
      ['settings', 'Settings'],
      ['my-data', 'My Data'],
    ];
    for (const [hash, heading] of tabs) {
      await page.goto(`chrome-extension://${extensionId}/options.html#${hash}`);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    }
    await page.close();
    return tabs.map(([, h]) => h).join(', ');
  });

  await check('no console errors from the extension', () => {
    expect(extensionErrors).toEqual([]);
  });
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}

const failed = results.filter((r) => r.status === 'FAIL').length;
const skipped = results.filter((r) => r.status === 'SKIP').length;
console.log(
  `\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped` +
    ` (production build ${EXTENSION_DIR})`,
);
process.exit(failed ? 1 : 0);
