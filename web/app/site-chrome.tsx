/** P18c: the header and footer every web companion page shares. Plain links, no scripts. */
import Link from 'next/link';
import { FEEDBACK_URL, GITHUB_URL } from '@studylens/shared/links';

export function SiteHeader() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="wrap site-head">
        <Link className="brand" href="/">
          {/* Plain <img>: a tiny static icon, no image optimizer needed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/icon-48.png" alt="" width={32} height={32} />
          StudyLens
        </Link>
        <nav aria-label="Site">
          <Link href="/privacy">Privacy</Link>
          <a href={GITHUB_URL} rel="noopener noreferrer">
            GitHub
          </a>
        </nav>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="wrap site-foot">
      <nav aria-label="Footer">
        <Link href="/privacy">Privacy policy</Link>
        {FEEDBACK_URL && (
          <a href={FEEDBACK_URL} rel="noopener noreferrer">
            Send feedback (anonymous form)
          </a>
        )}
        <a href={GITHUB_URL} rel="noopener noreferrer">
          Source code on GitHub
        </a>
      </nav>
      <p style={{ margin: 0 }}>
        This website has no cookies, no analytics and no trackers. StudyLens is a student project at
        UW Tacoma.
      </p>
    </footer>
  );
}
