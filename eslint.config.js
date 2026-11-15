import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['extension/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
    settings: { next: { rootDir: 'web/' } },
  },
  {
    files: ['*.{js,ts}', '**/*.config.{js,ts,mjs}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
