import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Compile the shared workspace package (it ships TypeScript source).
  transpilePackages: ['@studylens/shared'],
  // The extension's E2E tests run their own dev server (extension/playwright.config.ts) with
  // STUDYLENS_NEXT_DIST=.next-e2e, so it never clashes with a `npm run dev -w web` already running.
  ...(process.env.STUDYLENS_NEXT_DIST && { distDir: process.env.STUDYLENS_NEXT_DIST }),
  poweredByHeader: false,
  // P18c: basic hardening for the web companion; live rooms are never indexed and never leak
  // their code through the Referer header.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/s/:code*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
