/**
 * TEMPORARY (P2/P3 debug view) — shows today's minutes per site (registrable domain) with its
 * category, so tracking and labels can be checked by hand.
 * Shown below the focus session UI; replace with the My Data page in P6.
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '@/src/background/browser-adapter';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/src/categories/display';
import { loadDebugSnapshot, type DebugSnapshot, type LoadState } from '@/src/popup/popup-data';
import { LoadError, Loading } from './LoadStatus';

export default function DebugActivity() {
  const [load, setLoad] = useState<LoadState<DebugSnapshot>>({ status: 'loading' });

  const refresh = useCallback(() => {
    void loadDebugSnapshot(localStore, Date.now()).then(setLoad);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const snap = load.status === 'ready' ? load.data : null;

  return (
    <section style={{ marginTop: 12, border: '1px dashed #c60', padding: 8, borderRadius: 6 }}>
      <strong style={{ color: '#c60', fontSize: 12 }}>TEMPORARY DEBUG VIEW (P2/P3)</strong>
      {load.status === 'loading' && <Loading />}
      {load.status === 'error' && (
        <LoadError
          what="Debug view"
          message={load.message}
          onRetry={() => {
            setLoad({ status: 'loading' });
            refresh();
          }}
        />
      )}
      {snap && (
        <div style={{ fontSize: 12, margin: '4px 0 8px' }}>
          {snap.paused
            ? 'Tracking paused'
            : `Now: ${snap.current ?? '(not tracking)'}${
                snap.currentCategory ? ` (${CATEGORY_LABELS[snap.currentCategory]})` : ''
              }`}
        </div>
      )}
      {snap && snap.sites.length === 0 && (
        <div style={{ fontSize: 12 }}>Nothing tracked today.</div>
      )}
      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {snap?.sites.map((s) => (
            <tr key={s.site} title={s.hostnames.join(', ')}>
              <td style={{ paddingRight: 12 }}>{s.site}</td>
              <td style={{ paddingRight: 12, color: CATEGORY_COLORS[s.category] }}>
                {CATEGORY_LABELS[s.category]}
              </td>
              <td style={{ textAlign: 'right' }}>{(s.ms / 60_000).toFixed(1)} min</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        style={{ marginTop: 8, fontSize: 12 }}
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
