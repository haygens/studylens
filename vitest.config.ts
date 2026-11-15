import { defineConfig } from 'vitest/config';

// One root Vitest run covers every workspace; each workspace has its own vitest.config.ts.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'extension', 'web'],
  },
});
