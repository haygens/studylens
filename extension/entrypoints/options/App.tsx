/**
 * Options page with four tabs: Site categories (P3), Insights (local dashboard, P11), Settings
 * (pause tracking, research interventions — P8, study mode — P13c) and My Data (P6). The tab lives in the URL hash
 * (`options.html#my-data`), so the popup can link straight to My Data.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import ErrorBoundary from '../popup/ErrorBoundary';
import ResearchCard from '@/src/ui/ResearchCard';
import StudyModeCard from '@/src/ui/StudyModeCard';
import ThemePicker from '@/src/ui/ThemePicker';
import FeedbackLink from '@/src/ui/FeedbackLink';
import { feedbackLink } from '@/src/ui/feedback';
import Insights from './Insights';
import MyData, { PauseCard } from './MyData';
import SiteCategories from './SiteCategories';

type Tab = 'categories' | 'insights' | 'settings' | 'my-data';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Site categories' },
  { id: 'insights', label: 'Insights' },
  { id: 'settings', label: 'Settings' },
  { id: 'my-data', label: 'My Data' },
];

function tabFromHash(): Tab {
  return TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'categories';
}

const nav: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '16px 16px 0',
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
};

const page: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '24px 16px',
  lineHeight: 1.4,
};

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = `StudyLens — ${TABS.find((t) => t.id === tab)?.label ?? ''}`;
  }, [tab]);

  return (
    <>
      <nav style={nav} aria-label="StudyLens settings">
        <span className="sl-row" style={{ marginRight: 12, fontWeight: 750 }}>
          <img src="/icon/32.png" alt="" width={26} height={26} className="sl-logo" />
          <span style={{ fontSize: 'var(--sl-fs-h3)' }}>StudyLens</span>
        </span>
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            aria-current={tab === t.id ? 'page' : undefined}
            className="sl-tab"
          >
            {t.label}
          </a>
        ))}
      </nav>
      {tab === 'insights' ? (
        <main style={page}>
          <ErrorBoundary name="Insights">
            <Insights />
          </ErrorBoundary>
        </main>
      ) : tab === 'my-data' ? (
        <main style={page}>
          <ErrorBoundary name="My Data">
            <MyData />
          </ErrorBoundary>
        </main>
      ) : tab === 'settings' ? (
        <main style={page}>
          <h1 style={{ margin: 0, fontSize: 'var(--sl-fs-h1)' }}>Settings</h1>
          <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-look">
            <h2 id="sl-look" style={{ margin: '0 0 4px', fontSize: 'var(--sl-fs-h2)' }}>
              Look
            </h2>
            <p className="sl-muted" style={{ margin: '0 0 12px' }}>
              Pick a theme. It changes every StudyLens page right away.
            </p>
            <ThemePicker />
          </section>
          <ErrorBoundary name="Tracking setting">
            <PauseCard />
          </ErrorBoundary>
          <ErrorBoundary name="Research setting">
            <ResearchCard />
          </ErrorBoundary>
          <ErrorBoundary name="Study mode">
            <StudyModeCard />
          </ErrorBoundary>
          {feedbackLink() && (
            <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-feedback">
              <h2 id="sl-feedback" style={{ margin: '0 0 4px', fontSize: 'var(--sl-fs-h2)' }}>
                Feedback
              </h2>
              <p className="sl-muted" style={{ margin: '0 0 8px' }}>
                Tell us what works and what doesn’t. The form opens in a new tab; StudyLens sends
                nothing by itself.
              </p>
              <FeedbackLink />
            </section>
          )}
        </main>
      ) : (
        <ErrorBoundary name="Site categories">
          <SiteCategories />
        </ErrorBoundary>
      )}
    </>
  );
}
