/**
 * Landing page (P18c): what StudyLens is, screenshots, install buttons, the privacy promise and
 * links. Static: no scripts of its own, no cookies, no analytics. The research is mentioned only
 * briefly and neutrally (the study itself is pending advisor and IRB review: no hypotheses, no
 * results, no recruitment).
 */
import Link from 'next/link';
import { INSTALL_LINKS } from '@studylens/shared/links';
import { SiteFooter, SiteHeader } from './site-chrome';

export const dynamic = 'force-static';

const SCREENSHOTS = [
  {
    src: '/media/focus-session.png',
    alt: 'The StudyLens popup during a focus session: the goal, a countdown ring and the time left.',
    caption: 'Start a focus session with a goal and a timer.',
  },
  {
    src: '/media/friction-countdown.png',
    alt: 'A short countdown page shown before a site labeled as distracting loads.',
    caption: 'A short pause before a distracting site loads.',
  },
  {
    src: '/media/intention-question.png',
    alt: 'A page asking “What did you come here for?” before a distracting site loads.',
    caption: '“What did you come here for?” — a moment to decide.',
  },
  {
    src: '/media/insights.png',
    alt: 'The Insights page with charts of focus time per day and time of day.',
    caption: 'See your focus time and best time of day, calculated on your device.',
  },
] as const;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">Focus sessions that respect your privacy.</h1>
          <p className="lead">
            StudyLens is a free browser extension for students. Start a focus session, see where
            your study time actually goes, and get a gentle nudge when a distracting site pulls you
            away. Everything it records stays on your device.
          </p>
          <div className="buttons">
            <a className="btn" href={INSTALL_LINKS.firefox} rel="noopener noreferrer">
              Install for Firefox
            </a>
            <a className="btn btn-secondary" href={INSTALL_LINKS.edge} rel="noopener noreferrer">
              Install for Edge
            </a>
          </div>
        </section>

        <section aria-labelledby="shots-title">
          <h2 id="shots-title">A quick look</h2>
          <ul className="shots">
            {SCREENSHOTS.map((s, i) => (
              <li key={s.src}>
                <figure>
                  {/* Plain <img> on purpose: static, prerendered, sized and lazy-loaded. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.src}
                    alt={s.alt}
                    width={1280}
                    height={800}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                  <figcaption>{s.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="features-title">
          <h2 id="features-title">What it does</h2>
          <div className="features">
            <div className="card">
              <h3>Focus sessions</h3>
              <p>Pick a goal and a length. A quick check-in at the end asks how it went.</p>
            </div>
            <div className="card">
              <h3>Your own labels</h3>
              <p>You decide which sites count as study, neutral or distraction.</p>
            </div>
            <div className="card">
              <h3>Insights</h3>
              <p>Charts of your focus time, calculated in your browser.</p>
            </div>
            <div className="card">
              <h3>Study groups (optional)</h3>
              <p>
                Focus together with friends: shared timers and daily focus minutes, only if you
                choose to share them. Never the sites you visit.
              </p>
            </div>
          </div>
        </section>

        <section className="card promise" aria-labelledby="promise-title">
          <h2 id="promise-title">Your browsing stays yours</h2>
          <ul>
            <li>
              It records website names only (like “youtube.com”), never full addresses, page
              content, or what you type.
            </li>
            <li>Everything stays on your device. No account, no ads, no analytics.</li>
            <li>It never runs in private windows.</li>
            <li>See, export or delete everything it stored, any time, on its “My Data” page.</li>
            <li>
              Study groups are off unless you join one, and then share only what you switch on.
            </li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            Read the full <Link href="/privacy">privacy policy</Link>.
          </p>
        </section>

        <section aria-labelledby="research-title">
          <h2 id="research-title">A little research</h2>
          <p className="muted" style={{ margin: 0 }}>
            StudyLens also tests which focus helpers work. A session may show one of a few helpers,
            or none, and you can turn this off at any time in the extension. Nothing about it leaves
            your device.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
