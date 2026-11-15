import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineProject({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: { name: 'web', environment: 'node' },
});
