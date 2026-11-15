/**
 * TEMPORARY (P2 debug view) — shows today's minutes per hostname so tracking can be checked by hand.
 * Replace with the real popup in P4 and the My Data page in P6.
 */
import { useEffect, useState } from 'react';
import { localStore } from '@/src/background/browser-adapter';
import {
  getSegmentsForDays,
  isTrackingPaused,
  loadTrackerState,
} from '@/src/storage/activity-store';
import { startOfLocalDay, totalsByHostname, type HostTotal } from '@/src/tracker/totals';
import { MAX_GAP_MS, type Segment } from '@/src/tracker/tracker';

interface Snapshot {
  totals: HostTotal[];
  current: string | null;
  paused: boolean;
}

async function loadSnapshot(): Promise<Snapshot> {
  const now = Date.now();
  const dayStart = startOfLocalDay(now);
  // Include yesterday's bucket so a segment that started before midnight is clipped into today.
  const segments: Segment[] = await getSegmentsForDays(localStore, [dayStart - 1, now]);
  const state = await loadTrackerState(localStore);
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
    totals: totalsByHostname(segments, dayStart, now + 1),
    current: state.open?.hostname ?? null,
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
      <strong style={{ color: '#c60', fontSize: 12 }}>TEMPORARY DEBUG VIEW (P2)</strong>
      <div style={{ fontSize: 12, margin: '4px 0 8px' }}>
        {snap?.paused ? 'Tracking paused' : `Now: ${snap?.current ?? '(not tracking)'}`}
      </div>
      {snap && snap.totals.length === 0 && (
        <div style={{ fontSize: 12 }}>Nothing tracked today.</div>
      )}
      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {snap?.totals.map((t) => (
            <tr key={t.hostname}>
              <td style={{ paddingRight: 12 }}>{t.hostname}</td>
              <td style={{ textAlign: 'right' }}>{(t.ms / 60_000).toFixed(1)} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
