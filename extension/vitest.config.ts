import { defineProject } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { fileURLToPath } from 'node:url';

export default defineProject({
  // root: tests run from the repo root, so tell WXT where the extension lives.
  plugins: [WxtVitest({ root: fileURLToPath(new URL('./', import.meta.url)) })],
  // Unit tests run like a normal build: E2E-only features are off.
  define: {
    __STUDYLENS_E2E__: 'false',
    __STUDYLENS_API_BASE__: JSON.stringify('https://api.test.invalid'),
  },
  test: { name: 'extension', environment: 'node', exclude: ['**/node_modules/**', 'e2e/**'] },
});
