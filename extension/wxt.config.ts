import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'StudyLens',
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
