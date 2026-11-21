/**
 * My Data (P6): everything StudyLens stores, shown raw in tables, plus export, delete everything,
 * and pause tracking. Reads storage directly and follows every change, so it is always current.
 */
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '@/src/background/browser-adapter';
import CategoryChip from '@/src/ui/CategoryChip';
import { exportFileName, exportJson } from '@/src/my-data/export';
import {
  activeSession,
  activityByDay,
  formatClock,
  formatMinutes,
  recordingNow,
  sessionRows,
  siteLabels,
  weeklyTotals,
} from '@/src/my-data/tables';
import { LOAD_TIMEOUT_MS, settle, type LoadState } from '@/src/popup/popup-data';
import type { SessionMessage, SessionReply } from '@/src/sessions/messages';
import ResearchCard from '@/src/ui/ResearchCard';
import { useTrackingPaused } from '@/src/ui/use-tracking-paused';
import { LoadError, Loading } from '../popup/LoadStatus';

const card: CSSProperties = {
  background: 'var(--sl-surface)',
  border: 'var(--sl-border-w) solid var(--sl-border)',
  borderRadius: 'var(--sl-radius)',
  boxShadow: 'var(--sl-card-shadow)',
  padding: 16,
  marginTop: 16,
};
const muted: CSSProperties = { color: 'var(--sl-muted)', fontSize: 'var(--sl-fs-small)' };
const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--sl-fs-small)',
};
const cell: CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  borderTop: '1px solid var(--sl-hair)',
  verticalAlign: 'top',
  overflowWrap: 'anywhere',
};
const head: CSSProperties = {
  ...cell,
  borderTop: 'none',
  color: 'var(--sl-muted)',
  fontWeight: 600,
};
const tableWrap: CSSProperties = { overflowX: 'auto' };

export function useAllData() {
  const [state, setState] = useState<LoadState<Record<string, unknown>>>({ status: 'loading' });
  const reload = useCallback(() => {
    void settle(localStore.getAll(), LOAD_TIMEOUT_MS).then(setState);
  }, []);
  useEffect(() => {
    reload();
    const onChanged = (_changes: unknown, area: string) => {
      if (area === 'local') reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [reload]);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    reload();
  }, [reload]);
  return { state, retry };
}

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function PauseCard() {
  const { state, setPaused, saveError, retry } = useTrackingPaused();
  if (state.status === 'error') {
    return <LoadError what="Tracking setting" message={state.message} onRetry={retry} />;
  }
  const paused = state.status === 'ready' && state.data;
  return (
    <section style={{ ...card, background: paused ? 'var(--sl-warn-soft)' : 'var(--sl-surface)' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Tracking</h2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={paused}
          disabled={state.status === 'loading'}
          onChange={(e) => setPaused(e.target.checked)}
        />
        Pause tracking
      </label>
      <p style={{ ...muted, marginBottom: 0 }}>
        {paused
          ? 'Tracking paused. StudyLens is not recording any sites. A running focus session keeps its timer, but nothing is counted until you resume.'
          : 'StudyLens is recording which site is active (domain names only) while you browse.'}
      </p>
      {saveError && (
        <p style={{ color: 'var(--sl-distraction)', fontSize: 'var(--sl-fs-small)' }}>
          {saveError}
        </p>
      )}
    </section>
  );
}

function NeverCollected() {
  return (
    <section style={{ ...card, background: 'var(--sl-bg)' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>What StudyLens never collects</h2>
      <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 'var(--sl-fs-body)' }}>
        <li>Full web addresses, search terms, page titles, or page content</li>
        <li>Keystrokes, form entries, passwords, or screenshots</li>
        <li>Anything in private / incognito windows</li>
      </ul>
      <p style={{ ...muted, marginBottom: 0 }}>
        Everything below is stored only in this browser. Nothing is sent anywhere.
      </p>
    </section>
  );
}

function DeleteCard({ onDeleted }: { onDeleted: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (typed !== 'DELETE' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const reply = (await browser.runtime.sendMessage({
        type: 'data:delete-all',
      } satisfies SessionMessage)) as SessionReply;
      if (!reply.ok) throw new Error(reply.error);
      setTyped('');
      onDeleted();
    } catch (err) {
      console.error('[StudyLens] delete everything failed', err);
      setError('Something went wrong, so nothing may have been deleted. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ ...card, borderColor: 'var(--sl-distraction)' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Delete everything</h2>
      <p style={muted}>
        This permanently deletes all your activity records, focus sessions, check-in answers, site
        labels and research settings from this browser, and stops a running session. It can't be
        undone. Export first if you want a copy. (If tracking is paused, it stays paused; if
        research interventions are off, they stay off.)
      </p>
      <form
        onSubmit={(e) => void onSubmit(e)}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--sl-fs-body)' }}
        >
          Type DELETE to confirm:
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            style={{ width: 100 }}
          />
        </label>
        <button
          type="submit"
          disabled={typed !== 'DELETE' || busy}
          style={{ color: typed === 'DELETE' ? 'var(--sl-distraction)' : undefined }}
        >
          Delete everything
        </button>
      </form>
      {error && (
        <p role="alert" style={{ color: 'var(--sl-distraction)', fontSize: 'var(--sl-fs-small)' }}>
          {error}
        </p>
      )}
    </section>
  );
}

function Tables({ stored }: { stored: Record<string, unknown> }) {
  const days = activityByDay(stored);
  const weeks = weeklyTotals(stored);
  const sessions = sessionRows(stored);
  const labels = siteLabels(stored);
  const running = activeSession(stored);
  const now = recordingNow(stored);

  return (
    <>
      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Right now</h2>
        <p style={{ fontSize: 'var(--sl-fs-body)', marginBottom: 0 }}>
          {now ? `Recording: ${now}` : 'Not recording any site at the moment.'}
          <br />
          {running
            ? `Focus session running: “${running.goal}”, ${formatMinutes(running.plannedMinutes)}, started ${formatClock(running.start)}.`
            : 'No focus session running.'}
        </p>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Activity records</h2>
        <p style={muted}>
          Which site was active and for how long. Only the domain is stored, never the page.
        </p>
        {days.length === 0 ? (
          <p style={muted}>No activity records.</p>
        ) : (
          days.map((day, i) => (
            <details key={day.day} open={i === 0} style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--sl-fs-body)' }}>
                {day.label} — {day.rows.length} record{day.rows.length === 1 ? '' : 's'},{' '}
                {day.total}
              </summary>
              <div style={tableWrap}>
                <table style={table} aria-label={`Activity on ${day.label}`}>
                  <thead>
                    <tr>
                      <th style={head}>Site</th>
                      <th style={head}>Start</th>
                      <th style={head}>End</th>
                      <th style={head}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.rows.map((r, j) => (
                      <tr key={j}>
                        <td style={cell}>{r.hostname}</td>
                        <td style={cell}>{r.start}</td>
                        <td style={cell}>{r.end}</td>
                        <td style={cell}>{r.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>
          Weekly totals (older than 30 days)
        </h2>
        <p style={muted}>
          Detailed records older than 30 days are combined into time per site and label for each
          week (Monday to Sunday), then deleted.
        </p>
        {weeks.length === 0 ? (
          <p style={muted}>No weekly totals yet.</p>
        ) : (
          weeks.map((w, i) => (
            <details key={w.week} open={i === 0} style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--sl-fs-body)' }}>
                {w.label} — {w.rows.length} site{w.rows.length === 1 ? '' : 's'}, {w.total}
              </summary>
              <div style={tableWrap}>
                <table style={table} aria-label={`Weekly totals, ${w.label}`}>
                  <thead>
                    <tr>
                      <th style={head}>Site</th>
                      <th style={head}>Label</th>
                      <th style={head}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.rows.map((r) => (
                      <tr key={`${r.site}|${r.category}`}>
                        <td style={cell}>{r.site}</td>
                        <td style={cell}>
                          <CategoryChip category={r.category} />
                        </td>
                        <td style={cell}>{r.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Focus sessions</h2>
        {sessions.length === 0 ? (
          <p style={muted}>No finished focus sessions.</p>
        ) : (
          <div style={tableWrap}>
            <table style={{ ...table, marginTop: 8 }} aria-label="Focus sessions">
              <thead>
                <tr>
                  <th style={head}>Started</th>
                  <th style={head}>Goal</th>
                  <th style={head}>Planned</th>
                  <th style={head}>Actual</th>
                  <th style={head}>Study / neutral / distraction</th>
                  <th style={head}>Distraction visits</th>
                  <th style={head}>Check-in</th>
                  <th style={head}>Condition</th>
                  <th style={head}>Friction countdowns</th>
                  <th style={head}>Intention prompts</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td style={cell}>{s.date}</td>
                    <td style={cell}>{s.goal}</td>
                    <td style={cell}>{s.planned}</td>
                    <td style={cell}>{s.actual}</td>
                    <td style={cell}>
                      {s.minutes.study} / {s.minutes.neutral} / {s.minutes.distraction}
                    </td>
                    <td style={cell}>{s.distractionVisits}</td>
                    <td style={cell}>{s.checkIn}</td>
                    <td style={cell}>{s.condition}</td>
                    <td style={cell}>{s.friction}</td>
                    <td style={cell}>{s.intention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Site labels</h2>
        {labels.length === 0 ? (
          <p style={muted}>No site labels.</p>
        ) : (
          <table style={{ ...table, marginTop: 8 }} aria-label="Site labels">
            <thead>
              <tr>
                <th style={head}>Domain</th>
                <th style={head}>Label</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((r) => (
                <tr key={r.domain}>
                  <td style={cell}>{r.domain}</td>
                  <td style={cell}>
                    <CategoryChip category={r.category} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export default function MyData() {
  const { state, retry } = useAllData();
  const [deleted, setDeleted] = useState(false);

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 'var(--sl-fs-h1)' }}>My Data</h1>
      <p style={muted}>
        This is everything StudyLens has stored about your browsing, exactly as it is saved in this
        browser. You can download it, delete it, pause tracking, or turn research interventions off
        at any time.
      </p>

      <PauseCard />
      <ResearchCard />
      <NeverCollected />

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Export</h2>
        <p style={muted}>Download everything below as one JSON file.</p>
        <button
          type="button"
          disabled={state.status !== 'ready'}
          onClick={() => {
            if (state.status !== 'ready') return;
            const now = Date.now();
            download(exportJson(state.data, now), exportFileName(now));
          }}
        >
          Export my data (JSON)
        </button>
        <p style={{ ...muted, marginBottom: 0 }}>
          <strong>How long data is kept:</strong> detailed activity records are kept for 30 days.
          After that, once a day, they are combined into weekly totals (time per site and label) and
          the detailed records are deleted automatically. Focus sessions are kept so Insights keeps
          working, but after 30 days their goal text is removed. Their numbers (minutes, visits,
          check-in answers, condition, and helper-page counts) are kept.
        </p>
      </section>

      {deleted && (
        <p
          role="status"
          style={{
            ...card,
            background: 'var(--sl-study-soft)',
            borderColor: 'var(--sl-study)',
            fontSize: 'var(--sl-fs-body)',
            marginBottom: 0,
          }}
        >
          Everything is deleted. StudyLens has no activity records, focus sessions, check-ins or
          site labels stored anymore.
        </p>
      )}

      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && (
        <LoadError what="My Data" message={state.message} onRetry={retry} />
      )}
      {state.status === 'ready' && <Tables stored={state.data} />}

      <DeleteCard onDeleted={() => setDeleted(true)} />
    </>
  );
}
