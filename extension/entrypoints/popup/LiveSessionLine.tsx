/**
 * Live group sessions (P18b) in the popup: "Live session in Chem · 12 min left · Join" for each
 * running session of my groups I'm not in. Only while the popup is open (polled every 15 s), only
 * when this browser is in a group, and only while no focus session runs here. Nothing for solo
 * users (no request at all).
 */
import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { LiveSession } from '@studylens/shared';
import { joinLiveSession } from '@/src/groups/live';
import { liveRemainingMs, timeLeftText } from '@/src/groups/live-view';
import {
  beginDeps,
  beginErrorText,
  useActiveSession,
  useLiveSessions,
  useSecondTick,
} from '@/src/ui/live';

function openStudyGroups() {
  void browser.tabs
    .create({ url: `${browser.runtime.getURL('/options.html')}#groups` })
    .then(() => window.close());
}

function Line({ session, offsetMs }: { session: LiveSession; offsetMs: number }) {
  const now = useSecondTick();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTab, setNeedsTab] = useState(false);

  async function join() {
    setBusy(true);
    setError(null);
    const res = await joinLiveSession(beginDeps, session.id);
    setBusy(false);
    if (res.ok) return; // The popup switches to the running session (storage change).
    // Firefox's permission prompt doesn't work well from a popup: send them to the tab.
    setNeedsTab('failure' in res && res.failure.kind === 'no-activity-consent');
    setError(beginErrorText(res));
  }

  return (
    <li>
      <span className="sl-chip sl-chip-study">
        <span className="slm-live-dot" aria-hidden="true">
          ●
        </span>{' '}
        Live
      </span>{' '}
      Live session in <strong>{session.groupName}</strong>
      <span className="sl-muted">
        {' '}
        · {timeLeftText(liveRemainingMs(session, offsetMs, now))}
      </span>{' '}
      <button
        type="button"
        className="sl-btn-primary"
        disabled={busy}
        onClick={() => void join()}
        aria-label={`Join the live session in ${session.groupName}`}
      >
        {busy ? 'Joining…' : 'Join'}
      </button>
      {session.goal && (
        <span className="sl-muted sl-small" style={{ display: 'block' }}>
          Goal: {session.goal}
        </span>
      )}
      {error && (
        <span role="alert" className="sl-error" style={{ display: 'block', marginTop: 4 }}>
          {error}{' '}
          {needsTab && (
            <button type="button" className="sl-link" onClick={openStudyGroups}>
              Open Study groups
            </button>
          )}
        </span>
      )}
    </li>
  );
}

export default function LiveSessionLine() {
  const active = useActiveSession();
  const { state } = useLiveSessions();
  if (active !== null || state.status !== 'ready') return null;
  const joinable = state.sessions.filter((s) => s.me === null);
  if (joinable.length === 0) return null;
  return (
    <ul
      aria-label="Live group sessions"
      style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}
    >
      {joinable.map((s) => (
        <Line key={s.id} session={s} offsetMs={state.offsetMs} />
      ))}
    </ul>
  );
}
