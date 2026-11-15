/**
 * TEMPORARY (P2/P3 debug view) — shows today's minutes per site (registrable domain) with its
 * category, so tracking and labels can be checked by hand.
 * Replace with the real popup in P4 and the My Data page in P6.
 */
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '@/src/background/browser-adapter';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/src/categories/display';
import { categoryOf, type CategoryRule } from '@/src/categories/rules';
import { totalsBySite, type SiteTotal } from '@/src/categories/sites';
import { loadRules } from '@/src/storage/categories-store';
import {
  getSegmentsForDays,
  isTrackingPaused,
  loadTrackerState,
} from '@/src/storage/activity-store';
import { startOfLocalDay, totalsByHostname } from '@/src/tracker/totals';
import { MAX_GAP_MS, type Segment } from '@/src/tracker/tracker';

interface Snapshot {
  sites: SiteTotal[];
  current: string | null;
  rules: CategoryRule[];
  paused: boolean;
}

async function loadSnapshot(): Promise<Snapshot> {
  const now = Date.now();
  const dayStart = startOfLocalDay(now);
  // Include yesterday's bucket so a segment that started before midnight is clipped into today.
  const segments: Segment[] = await getSegmentsForDays(localStore, [dayStart - 1, now]);
  const state = await loadTrackerState(localStore);
  const rules = await loadRules(localStore);
  const { open } = state;
  // Count the open segment up to now, but never past what the tracker itself would trust.
  if (open) {
    segments.push({
      hostname: open.hostname,
      start: open.start,
      end: Math.min(now, open.lastSeen + MAX_GAP_MS),
    });
  }
  return {
    sites: totalsBySite(totalsByHostname(segments, dayStart, now + 1), rules),
    current: state.open?.hostname ?? null,
    rules,
    paused: await isTrackingPaused(localStore),
  };
}

export default function DebugActivity() {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const refresh = () => void loadSnapshot().then(setSnap);
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{ marginTop: 12, border: '1px dashed #c60', padding: 8, borderRadius: 6 }}>
      <strong style={{ color: '#c60', fontSize: 12 }}>TEMPORARY DEBUG VIEW (P2/P3)</strong>
      <div style={{ fontSize: 12, margin: '4px 0 8px' }}>
        {snap?.paused
          ? 'Tracking paused'
          : `Now: ${snap?.current ?? '(not tracking)'}${
              snap?.current ? ` (${CATEGORY_LABELS[categoryOf(snap.current, snap.rules)]})` : ''
            }`}
      </div>
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
