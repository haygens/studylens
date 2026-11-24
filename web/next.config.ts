import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Compile the shared workspace package (it ships TypeScript source).
  transpilePackages: ['@studylens/shared'],
  // The extension's E2E tests run their own dev server (extension/playwright.config.ts) with
  // STUDYLENS_NEXT_DIST=.next-e2e, so it never clashes with a `npm run dev -w web` already running.
  ...(process.env.STUDYLENS_NEXT_DIST && { distDir: process.env.STUDYLENS_NEXT_DIST }),
};

export default nextConfig;
