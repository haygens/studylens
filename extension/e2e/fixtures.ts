/**
 * Playwright fixtures that launch a browser with the E2E build of the extension loaded (or, with
 * `test.use({ build: 'normal' })`, the normal Edge build — run `npm run build:edge` first;
 * `npm run test:e2e` does).
 *
 * - Locally (Windows): the installed Microsoft Edge (`channel: 'msedge'`), so no browser download.
 * - In CI (`CI` env var set): Playwright's Chromium (`npx playwright install chromium`).
 * - Override with `E2E_CHANNEL=chromium` or `E2E_CHANNEL=msedge`.
 *
 * Every test gets a fresh, empty browser profile. All http(s) requests are answered by tiny stub
 * pages or blocked, so tests never touch the real internet — except the local StudyLens web API
 * that playwright.config.ts starts for the study group tests (P16, `E2E_API_BASE`).
 * `launchExtension` opens a second, separate profile (a "second person") when a test needs one.
 *
 * Research interventions are on by default from v0.2.0. So that tests about other features don't
 * get random friction/intention pages, each test starts with `interventions:enabled = false`
 * written to storage (the `seed` option). Tests about a real default install use
 * `test.use({ seed: {} })`.
 */
import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_API_BASE } from '../server-urls';

const EXTENSION_DIRS = {
  e2e: fileURLToPath(new URL('../.output/edge-mv3-e2e', import.meta.url)),
  normal: fileURLToPath(new URL('../.output/edge-mv3', import.meta.url)),
} as const;

export const STUB_SITES: Record<string, string> = {
  'en.wikipedia.org': 'Wikipedia (fake)',
  'www.youtube.com': 'YouTube (fake)',
};

function channel(): string {
  return process.env.E2E_CHANNEL ?? (process.env.CI ? 'chromium' : 'msedge');
}

async function stubInternet(context: BrowserContext): Promise<void> {
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    if (url.startsWith(`${E2E_API_BASE}/`)) return route.fallback(); // the local web API
    const host = new URL(url).hostname;
    const title = STUB_SITES[host];
    if (!title) return route.abort('blockedbyclient');
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>${title}</title><h1>${title}</h1>`,
    });
  });
}

/** Minimal typing for the `chrome` APIs used inside the background service worker. */
interface Chrome {
  chrome: {
    action: { getBadgeText(details: object): Promise<string> };
    alarms: { getAll(): Promise<{ name: string }[]> };
    permissions: { getAll(): Promise<{ permissions?: string[]; origins?: string[] }> };
    storage: {
      local: {
        get(keys: null): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
      };
    };
  };
}

/** Reads the toolbar badge and storage from the extension's background service worker. */
export class Background {
  constructor(private readonly context: BrowserContext) {}

  /** The current service worker (it can be stopped and restarted by the browser). */
  private async worker(): Promise<Worker> {
    const [sw] = this.context.serviceWorkers();
    return sw ?? this.context.waitForEvent('serviceworker');
  }

  /** Runs `fn` against the worker, retrying if the browser restarted it in between. */
  private async run<T>(fn: (sw: Worker) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn(await this.worker());
      } catch (err) {
        if (attempt >= 2) throw err;
      }
    }
  }

  // The callbacks below run inside the service worker, where `chrome` is a global.
  badge(): Promise<string> {
    return this.run((sw) =>
      sw.evaluate(() => (globalThis as unknown as Chrome).chrome.action.getBadgeText({})),
    );
  }

  async alarmNames(): Promise<string[]> {
    const alarms = await this.run((sw) =>
      sw.evaluate(() => (globalThis as unknown as Chrome).chrome.alarms.getAll()),
    );
    return alarms.map((a) => a.name).sort();
  }

  /** The permissions the extension holds right now (granted at install or at runtime). */
  permissions(): Promise<{ permissions?: string[]; origins?: string[] }> {
    return this.run((sw) =>
      sw.evaluate(() => (globalThis as unknown as Chrome).chrome.permissions.getAll()),
    );
  }

  storage(): Promise<Record<string, unknown>> {
    return this.run((sw) =>
      sw.evaluate(() => (globalThis as unknown as Chrome).chrome.storage.local.get(null)),
    );
  }

  async get<T>(key: string): Promise<T> {
    return (await this.storage())[key] as T;
  }

  /** Writes storage keys, e.g. to turn on a feature flag for a test. */
  set(items: Record<string, unknown>): Promise<void> {
    return this.run((sw) =>
      sw.evaluate((i) => (globalThis as unknown as Chrome).chrome.storage.local.set(i), items),
    );
  }
}

interface Options {
  /** Which build to load: the E2E test build (default) or the normal Edge build. */
  build: keyof typeof EXTENSION_DIRS;
  /** Storage written right after the extension loads, before any page opens. */
  seed: Record<string, unknown>;
  /**
   * A new install opens the welcome page (P13b). Most tests don't need it, so it is closed
   * before the test starts ('close'); welcome tests use 'keep' and get it as `welcomePage`.
   */
  welcome: 'close' | 'keep';
}

interface Fixtures {
  context: BrowserContext;
  /** The welcome page that opened on install (only with `test.use({ welcome: 'keep' })`). */
  welcomePage: Page;
  extensionId: string;
  background: Background;
  /** `beforeLoad` runs before the popup's scripts (e.g. to add an init script). */
  openPopup: (beforeLoad?: (page: Page) => Promise<unknown>) => Promise<Page>;
  openOptions: () => Promise<Page>;
  openMyData: () => Promise<Page>;
}

export const test = base.extend<Fixtures & Options>({
  build: ['e2e', { option: true }],
  seed: [{ 'interventions:enabled': false }, { option: true }],
  welcome: ['close', { option: true }],

  context: async ({ headless, build }, use) => {
    const { context, close } = await openContext(build, headless);
    await use(context);
    await close();
  },

  extensionId: async ({ context, seed, welcome }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    if (Object.keys(seed).length > 0) await new Background(context).set(seed);
    // Wait for the welcome tab first, so it can never steal focus from the test's own pages.
    const page = await findWelcomePage(context);
    if (welcome === 'close') await page.close();
    await use(new URL(sw.url()).host);
  },

  welcomePage: async ({ context, extensionId }, use) => {
    void extensionId; // Opens (and keeps) the welcome page first.
    await use(await findWelcomePage(context));
  },

  background: async ({ context, extensionId }, use) => {
    void extensionId; // Make sure the seed is written first.
    await use(new Background(context));
  },

  /** The popup, opened as a normal tab (Playwright can't click the toolbar button). */
  openPopup: async ({ context, extensionId }, use) => {
    await use(async (beforeLoad) => {
      const page = await context.newPage();
      await beforeLoad?.(page);
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      return page;
    });
  },

  openOptions: async ({ context, extensionId }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/options.html`);
      return page;
    });
  },

  openMyData: async ({ context, extensionId }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/options.html#my-data`);
      await expect(page.getByRole('heading', { name: 'My Data', level: 1 })).toBeVisible();
      return page;
    });
  },
});

export { expect };

/** A fresh browser profile with the extension loaded (internet stubbed). */
async function openContext(
  build: keyof typeof EXTENSION_DIRS,
  headless: boolean,
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const EXTENSION_DIR = EXTENSION_DIRS[build];
  if (!existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
    throw new Error(`Build missing: ${EXTENSION_DIR}. Run \`npm run test:e2e\`.`);
  }
  // os.tmpdir() follows TEMP/TMP, which point to M: on hs's PC.
  const profile = mkdtempSync(path.join(os.tmpdir(), 'studylens-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: channel(),
    headless,
    reducedMotion: 'reduce', // P21: animations can't cause flakes
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      // Newer Chrome/Edge versions need this to keep allowing --load-extension.
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
    ],
  });
  await stubInternet(context);
  return {
    context,
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

export interface ExtensionProfile {
  context: BrowserContext;
  extensionId: string;
  background: Background;
  /** Opens an extension page, e.g. `options.html#groups`. */
  open: (pathAndHash: string) => Promise<Page>;
  close: () => Promise<void>;
}

/**
 * A second, independent browser profile with the extension (the E2E build), set up like the
 * fixtures' one: seeded storage, welcome page closed. Close it at the end of the test.
 */
export async function launchExtension(
  headless: boolean,
  seed: Record<string, unknown> = { 'interventions:enabled': false },
): Promise<ExtensionProfile> {
  const { context, close } = await openContext('e2e', headless);
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const background = new Background(context);
  if (Object.keys(seed).length > 0) await background.set(seed);
  await (await findWelcomePage(context)).close();
  const extensionId = new URL(sw.url()).host;
  return {
    context,
    extensionId,
    background,
    async open(pathAndHash) {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${pathAndHash}`);
      return page;
    },
    close,
  };
}

/** The welcome page that a new install opens (P13b). */
export async function findWelcomePage(context: BrowserContext): Promise<Page> {
  const isWelcome = (p: Page) => p.url().includes('/welcome.html');
  await expect
    .poll(() => context.pages().some(isWelcome), { timeout: 15_000, message: 'welcome page' })
    .toBe(true);
  return context.pages().find(isWelcome)!;
}

/** Labels wikipedia.org = Study and youtube.com = Distraction through the options page. */
export async function labelSites(openOptions: () => Promise<Page>): Promise<void> {
  const options = await openOptions();
  for (const [domain, category] of [
    ['wikipedia.org', 'study'],
    ['youtube.com', 'distraction'],
  ] as const) {
    await options.getByLabel('New site', { exact: true }).fill(domain);
    await options.getByLabel('New site category').selectOption(category);
    await options.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(options.getByLabel(`Category for ${domain}`)).toHaveValue(category);
  }
  await options.close();
}

/** Turns research interventions back on (the fixtures' `seed` turns them off for each test). */
export async function enableInterventions(background: Background): Promise<void> {
  await background.set({ 'interventions:enabled': true });
}

/** Fills the Start form with a test length in seconds (E2E build only) and starts. */
export async function startSession(popup: Page, goal: string, seconds: number): Promise<void> {
  await popup.getByLabel('What will you work on?').fill(goal);
  await popup.getByLabel('Test length in seconds (E2E build only)').fill(String(seconds));
  await popup.getByRole('button', { name: 'Start focus session' }).click();
  await expect(popup.getByText('Focusing on')).toBeVisible();
}

/**
 * Stops the background service worker (as the browser does when it is idle) and waits until it
 * really has stopped: no worker answers, or the one that answers is a fresh start (a mark set on
 * the old worker's global is gone). `page` is any open page, used for the DevTools session.
 */
export async function stopBackground(context: BrowserContext, page: Page): Promise<void> {
  const [worker] = context.serviceWorkers();
  await worker?.evaluate(() => ((globalThis as Record<string, unknown>).__studylensMark = 1));
  const cdp = await context.newCDPSession(page);
  const running = new Promise<string[]>((resolve) => {
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      const ids = versions
        .filter((v) => v.scriptURL.endsWith('/background.js') && v.runningStatus === 'running')
        .map((v) => v.versionId);
      if (ids.length) resolve(ids);
    });
  });
  await cdp.send('ServiceWorker.enable');
  for (const versionId of await running) await cdp.send('ServiceWorker.stopWorker', { versionId });
  await cdp.detach();

  const state = async (): Promise<string> => {
    const current = context.serviceWorkers()[0];
    if (!current) return 'stopped';
    const answer = current
      .evaluate(() => ((globalThis as Record<string, unknown>).__studylensMark ? 'same' : 'fresh'))
      // Playwright reports a worker that was stopped as "Service worker restarted".
      .catch((err: unknown) => (/restarted|closed/i.test(String(err)) ? 'stopped' : 'error'));
    // A stopped worker that nothing has woken yet doesn't answer at all.
    const silent = new Promise<string>((resolve) => setTimeout(() => resolve('stopped'), 2000));
    return Promise.race([answer, silent]);
  };
  await expect.poll(state).toMatch(/^(stopped|fresh)$/);
}
