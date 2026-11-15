import { defineProject } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { fileURLToPath } from 'node:url';

export default defineProject({
  // root: tests run from the repo root, so tell WXT where the extension lives.
  plugins: [WxtVitest({ root: fileURLToPath(new URL('./', import.meta.url)) })],
  test: { name: 'extension', environment: 'node' },
});
