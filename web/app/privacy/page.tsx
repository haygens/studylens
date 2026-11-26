import type { Metadata } from 'next';
import { privacyHtml } from '@/lib/site/privacy';
import { SiteFooter, SiteHeader } from '../site-chrome';

/** /privacy (P18c): PRIVACY.md from the repository, rendered once at build time. */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What StudyLens records, where it is kept, and what is never shared.',
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap">
        <article
          className="prose card"
          // Our own PRIVACY.md from the repo, rendered at build time (no user content).
          dangerouslySetInnerHTML={{ __html: privacyHtml() }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
