/**
 * Popup "Today" section: today's time per category as one striped bar, then minutes per site
 * (registrable domain) with its category chip, plus a link to label sites. Refreshes every
 * 2 seconds while the popup is open.
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { SITE_CATEGORIES } from '@studylens/shared';
import { localStore } from '@/src/background/browser-adapter';
import { CATEGORY_LABELS } from '@/src/categories/display';
import { loadTodaySnapshot, type TodaySnapshot, type LoadState } from '@/src/popup/popup-data';
import { categoryTotals, formatWholeMinutes } from '@/src/popup/popup-view';
import CategoryChip, { CATEGORY_ICONS } from '@/src/ui/CategoryChip';
import { LoadError, Loading } from './LoadStatus';

const MAX_SITES = 6;

function DayBar({ snap }: { snap: TodaySnapshot }) {
  const totals = categoryTotals(snap.sites);
  const all = totals.study + totals.neutral + totals.distraction;
  const summary = SITE_CATEGORIES.map(
    (c) => `${CATEGORY_LABELS[c]} ${formatWholeMinutes(totals[c])}`,
  ).join(', ');
  return (
    <>
      <div className="sl-daybar" role="img" aria-label={`Today: ${summary}`}>
        {SITE_CATEGORIES.filter((c) => totals[c] > 0).map((c) => (
          <span key={c} className={`sl-fill sl-fill-${c}`} style={{ flex: totals[c] / all }} />
        ))}
      </div>
      <div className="sl-legend" aria-hidden="true">
        {SITE_CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICONS[c];
          return (
            <span key={c} className={`sl-row sl-text-${c}`} style={{ gap: 3 }}>
              <Icon />
              {CATEGORY_LABELS[c]} <b>{formatWholeMinutes(totals[c]).replace(' min', 'm')}</b>
            </span>
          );
        })}
      </div>
    </>
  );
}

export default function TodayActivity() {
  const [load, setLoad] = useState<LoadState<TodaySnapshot>>({ status: 'loading' });

  const refresh = useCallback(() => {
    void loadTodaySnapshot(localStore, Date.now()).then(setLoad);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const snap = load.status === 'ready' ? load.data : null;

  return (
    <section className="sl-card sl-stack" aria-labelledby="sl-today">
      <div className="sl-row-between">
        <h2 id="sl-today" className="sl-card-title">
          Today
        </h2>
        <button
          type="button"
          className="sl-link"
          onClick={() => {
            void browser.runtime.openOptionsPage();
            window.close();
          }}
        >
          Label sites
        </button>
      </div>
      {load.status === 'loading' && <Loading />}
      {load.status === 'error' && (
        <LoadError
          what="Today"
          message={load.message}
          onRetry={() => {
            setLoad({ status: 'loading' });
            refresh();
          }}
        />
      )}
      {snap && (
        <div className="sl-row sl-muted" style={{ flexWrap: 'wrap', gap: 6 }}>
          {snap.paused ? (
            'Paused. Showing what was recorded earlier today.'
          ) : snap.current ? (
            <>
              Now: <span style={{ color: 'var(--sl-ink)' }}>{snap.current}</span>
              {snap.currentCategory && <CategoryChip category={snap.currentCategory} />}
            </>
          ) : (
            'Now: not on a website'
          )}
        </div>
      )}
      {snap && snap.sites.length === 0 && (
        <div className="sl-empty">
          <strong>Nothing tracked today.</strong>
          <span className="sl-muted">
            Browse as usual. The sites you visit show up here, so you can see where your time goes.
          </span>
        </div>
      )}
      {snap && snap.sites.length > 0 && (
        <>
          <DayBar snap={snap} />
          <table className="sl-table sl-sites" aria-label="Sites today">
            <thead>
              <tr>
                <th>Site</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {snap.sites.slice(0, MAX_SITES).map((s) => (
                <tr key={s.site} title={s.hostnames.join(', ')}>
                  <td className="sl-site">{s.site}</td>
                  <td>
                    <CategoryChip category={s.category} />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatWholeMinutes(s.ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {snap.sites.length > MAX_SITES && (
            <p className="sl-muted sl-small" style={{ margin: 0 }}>
              + {snap.sites.length - MAX_SITES} more on the My Data page
            </p>
          )}
        </>
      )}
    </section>
  );
}
