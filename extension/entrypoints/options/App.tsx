/**
 * Options page with three tabs: Site categories (P3), Settings (pause tracking, research
 * interventions — P8) and My Data (P6). The tab lives in the URL hash (`options.html#my-data`),
 * so the popup can link straight to My Data.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import ErrorBoundary from '../popup/ErrorBoundary';
import ResearchCard from '@/src/ui/ResearchCard';
import MyData, { PauseCard } from './MyData';
import SiteCategories from './SiteCategories';

type Tab = 'categories' | 'settings' | 'my-data';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Site categories' },
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
  gap: 4,
  borderBottom: '1px solid #d0d7de',
  fontFamily: 'system-ui, sans-serif',
};

const page: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '24px 16px',
  fontFamily: 'system-ui, sans-serif',
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
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            aria-current={tab === t.id ? 'page' : undefined}
            style={{
              padding: '8px 12px',
              textDecoration: 'none',
              color: tab === t.id ? '#1f2328' : '#57606a',
              fontWeight: tab === t.id ? 600 : 400,
              borderBottom: tab === t.id ? '2px solid #0969da' : '2px solid transparent',
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>
      {tab === 'my-data' ? (
        <main style={page}>
          <ErrorBoundary name="My Data">
            <MyData />
          </ErrorBoundary>
        </main>
      ) : tab === 'settings' ? (
        <main style={page}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Settings</h1>
          <ErrorBoundary name="Tracking setting">
            <PauseCard />
          </ErrorBoundary>
          <ErrorBoundary name="Research setting">
            <ResearchCard />
          </ErrorBoundary>
        </main>
      ) : (
        <ErrorBoundary name="Site categories">
          <SiteCategories />
        </ErrorBoundary>
      )}
    </>
  );
}
