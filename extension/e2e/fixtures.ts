/**
 * Playwright fixtures that launch a browser with the E2E build of the extension loaded.
 *
 * - Locally (Windows): the installed Microsoft Edge (`channel: 'msedge'`), so no browser download.
 * - In CI (`CI` env var set): Playwright's Chromium (`npx playwright install chromium`).
 * - Override with `E2E_CHANNEL=chromium` or `E2E_CHANNEL=msedge`.
 *
 * Every test gets a fresh, empty browser profile. All http(s) requests are answered by tiny stub
 * pages or blocked, so tests never touch the real internet.
 */
import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = fileURLToPath(new URL('../.output/edge-mv3-e2e', import.meta.url));

export const STUB_SITES: Record<string, string> = {
  'en.wikipedia.org': 'Wikipedia (fake)',
  'www.youtube.com': 'YouTube (fake)',
};

function channel(): string {
  return process.env.E2E_CHANNEL ?? (process.env.CI ? 'chromium' : 'msedge');
}

async function stubInternet(context: BrowserContext): Promise<void> {
  await context.route(/^https?:\/\//, async (route) => {
    const host = new URL(route.request().url()).hostname;
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

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  background: Background;
  /** `beforeLoad` runs before the popup's scripts (e.g. to add an init script). */
  openPopup: (beforeLoad?: (page: Page) => Promise<unknown>) => Promise<Page>;
  openOptions: () => Promise<Page>;
  openMyData: () => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  context: async ({ headless }, use) => {
    const profile = mkdtempSync(path.join(os.tmpdir(), 'studylens-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: channel(),
      headless,
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
        // Newer Chrome/Edge versions need this to keep allowing --load-extension.
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
      ],
    });
    await stubInternet(context);
    await use(context);
    await context.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  },

  extensionId: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(sw.url()).host);
  },

  background: async ({ context }, use) => {
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

/** Turns on research interventions (P8), which are off by default until P10 ships. */
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
