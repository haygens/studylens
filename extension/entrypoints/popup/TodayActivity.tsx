/**
 * Popup "Today" section: today's minutes per site (registrable domain) with its category, plus a
 * link to edit site categories. Refreshes every 2 seconds while the popup is open.
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '@/src/background/browser-adapter';
import { CATEGORY_LABELS } from '@/src/categories/display';
import CategoryChip from '@/src/ui/CategoryChip';
import { loadTodaySnapshot, type TodaySnapshot, type LoadState } from '@/src/popup/popup-data';
import { LoadError, Loading } from './LoadStatus';

const cell = { padding: '2px 12px 2px 0' } as const;

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
    <section style={{ marginTop: 16, borderTop: '1px solid var(--sl-border)', paddingTop: 8 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--sl-fs-body)' }}>Today</h2>
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
        <div
          style={{ fontSize: 'var(--sl-fs-small)', margin: '4px 0 8px', color: 'var(--sl-muted)' }}
        >
          {snap.paused
            ? 'Tracking paused'
            : `Now: ${snap.current ?? '(not tracking)'}${
                snap.currentCategory ? ` (${CATEGORY_LABELS[snap.currentCategory]})` : ''
              }`}
        </div>
      )}
      {snap && snap.sites.length === 0 && (
        <div style={{ fontSize: 'var(--sl-fs-small)' }}>Nothing tracked today.</div>
      )}
      {snap && snap.sites.length > 0 && (
        <table
          style={{ fontSize: 'var(--sl-fs-small)', borderCollapse: 'collapse', width: '100%' }}
        >
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--sl-muted)' }}>
              <th style={cell}>Site</th>
              <th style={cell}>Category</th>
              <th style={{ ...cell, paddingRight: 0, textAlign: 'right' }}>Minutes</th>
            </tr>
          </thead>
          <tbody>
            {snap.sites.map((s) => (
              <tr key={s.site} title={s.hostnames.join(', ')}>
                <td style={cell}>{s.site}</td>
                <td style={cell}>
                  <CategoryChip category={s.category} />
                </td>
                <td style={{ ...cell, paddingRight: 0, textAlign: 'right' }}>
                  {(s.ms / 60_000).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        style={{ marginTop: 8, fontSize: 'var(--sl-fs-small)' }}
        onClick={() => {
          void browser.runtime.openOptionsPage();
          window.close();
        }}
      >
        Edit site categories…
      </button>
    </section>
  );
}
