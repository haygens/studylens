import { defineConfig } from 'wxt';
import { E2E_API_BASE, OPTIONAL_DATA_COLLECTION, PRODUCTION_API_BASE } from './server-urls';

/**
 * Firefox add-on ID. It can NEVER change after the first upload to addons.mozilla.org, so it lives
 * in one place. (Edge/Chromium builds don't use it.)
 */
const GECKO_ID = 'studylens@haygens.github.io';

/**
 * `wxt build --mode e2e` makes the E2E test build (output in `.output/<browser>-mv3-e2e`). Only
 * that build turns on test-only features such as session lengths in seconds: the flag below is
 * replaced with a literal `true`/`false` at build time, so normal builds drop that code entirely.
 * `scripts/check-builds.mjs` proves it (run in CI).
 *
 * The version comes from extension/package.json.
 */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: (env) => ({
    define: {
      __STUDYLENS_E2E__: JSON.stringify(env.mode === 'e2e'),
      __STUDYLENS_API_BASE__: JSON.stringify(
        env.mode === 'e2e' ? E2E_API_BASE : PRODUCTION_API_BASE,
      ),
    },
  }),
  manifest: ({ browser, mode }) => ({
    name: mode === 'e2e' ? 'StudyLens (E2E test build)' : 'StudyLens',
    description: 'Privacy-respecting focus tracker for students. Your data stays on your device.',
    // P18c: the web companion's landing page (store "website" fields point there too).
    homepage_url: 'https://studylens-flame.vercel.app/',
    // Icons come from public/icon/<size>.png (made by `npm run icons`). Set the toolbar icon
    // explicitly too, so every browser uses it.
    action: {
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' },
    },
    // Privacy rule 3: minimal permissions, no host permissions at install. The StudyLens server
    // is an OPTIONAL host permission, requested only when the user first joins or creates a study
    // group (P16). The E2E build instead gets its local test server at install, because Playwright
    // can't click the browser's permission prompt; its request() then resolves without a prompt.
    permissions: ['storage', 'tabs', 'idle', 'alarms'],
    ...(mode === 'e2e'
      ? { host_permissions: [`${E2E_API_BASE}/*`] }
      : { optional_host_permissions: [`${PRODUCTION_API_BASE}/*`] }),
    // Privacy rule 4: never run in private windows.
    incognito: 'not_allowed',
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: GECKO_ID,
          // `data_collection_permissions` needs Firefox 140+ (142+ on Android); 142 keeps
          // `web-ext lint` clean for both.
          strict_min_version: '142.0',
          // Nothing leaves the device by default; study groups are opt-in (see above).
          data_collection_permissions: { required: ['none'], optional: OPTIONAL_DATA_COLLECTION },
        },
      },
    }),
  }),
  zip: {
    name: 'studylens',
    // Mozilla reviewers rebuild the add-on from the sources zip. This is a monorepo, so zip from
    // the repo root: the build needs the root package.json + package-lock.json and the shared
    // workspace package. Allowlist only what the Firefox build needs (see README "Build from source").
    sourcesRoot: '..',
    includeSources: [
      'README.md',
      'PRIVACY.md',
      'package.json',
      'package-lock.json',
      'tsconfig.base.json',
      'extension/**',
      'packages/shared/**',
      // `npm ci` checks every workspace listed in package-lock.json, so the web app's
      // package.json must be present (its source code is not part of the extension).
      'web/package.json',
    ],
    excludeSources: [
      '**/node_modules/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/.env*',
      'extension/e2e/**',
      'extension/test-results/**',
      'extension/playwright-report/**',
      'extension/blob-report/**',
      'extension/playwright.config.ts',
      '**/coverage/**',
    ],
  },
});
