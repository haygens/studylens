import { defineConfig } from 'wxt';

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
    define: { __STUDYLENS_E2E__: JSON.stringify(env.mode === 'e2e') },
  }),
  manifest: ({ browser, mode }) => ({
    name: mode === 'e2e' ? 'StudyLens (E2E test build)' : 'StudyLens',
    description: 'Privacy-respecting focus tracker for students. Your data stays on your device.',
    homepage_url: 'https://github.com/haygens/studylens',
    // Icons come from public/icon/<size>.png (made by `npm run icons`). Set the toolbar icon
    // explicitly too, so every browser uses it.
    action: {
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' },
    },
    // Privacy rule 3: minimal permissions, no host permissions at install.
    permissions: ['storage', 'tabs', 'idle', 'alarms'],
    // Privacy rule 4: never run in private windows.
    incognito: 'not_allowed',
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: GECKO_ID,
          // `data_collection_permissions` needs Firefox 140+ (142+ on Android); 142 keeps
          // `web-ext lint` clean for both.
          strict_min_version: '142.0',
          // Nothing leaves the device by default. Opt-in research upload (P17) will add an
          // optional entry here.
          data_collection_permissions: { required: ['none'] },
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
