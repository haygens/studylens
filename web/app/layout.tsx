import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { WEBSITE_URL } from '@studylens/shared/links';
import { MOTION_CSS } from '@studylens/shared/motion';
import { THEMES, rootThemeCss } from '@studylens/shared/themes';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(WEBSITE_URL),
  title: {
    default: 'StudyLens: focus sessions that respect your privacy',
    template: '%s · StudyLens',
  },
  description:
    'A free browser extension for students: focus sessions, gentle help against distracting sites, and insights. Everything it records stays on your device.',
  icons: { icon: '/media/icon-48.png', apple: '/media/icon-128.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: THEMES.sunrise.tokens.bg,
};

/**
 * The web companion (P18c). No analytics, no cookies, no third-party scripts or fonts. Colors are
 * the extension's Sunrise theme tokens (packages/shared/src/themes.ts).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: room pages set data-look before hydration (P21).
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: rootThemeCss('sunrise') + MOTION_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
