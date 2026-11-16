import { defineConfig } from 'wxt';

/**
 * `wxt build --mode e2e` makes the E2E test build (output in `.output/<browser>-mv3-e2e`). Only
 * that build turns on test-only features such as session lengths in seconds: the flag below is
 * replaced with a literal `true`/`false` at build time, so normal builds drop that code entirely.
 * `scripts/check-builds.mjs` proves it (run in CI).
 */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: (env) => ({
    define: { __STUDYLENS_E2E__: JSON.stringify(env.mode === 'e2e') },
  }),
  manifest: ({ browser, mode }) => ({
    name: mode === 'e2e' ? 'StudyLens (E2E test build)' : 'StudyLens',
    description: 'Privacy-respecting focus tracker for students. Your data stays on your device.',
    // Privacy rule 3: minimal permissions, no host permissions at install.
    permissions: ['storage', 'tabs', 'idle', 'alarms'],
    // Privacy rule 4: never run in private windows.
    incognito: 'not_allowed',
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'studylens@studylens.dev',
          // Nothing leaves the device by default. Opt-in research upload (P17) will add an
          // optional entry here.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
