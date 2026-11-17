/**
 * Friction countdown page (P9). The background sends a tab here when the user enters a
 * Distraction site during a `friction` session. Shows the site, the session goal, a countdown,
 * then "Continue to <site>"; "Back to studying" works right away.
 *
 * Privacy: the full target address is only in this page's own address (so Continue can go
 * there). It is never stored, logged or sent: the background gets only the hostname.
 * Works even if the background script was suspended meanwhile (messages wake it up), and
 * Continue still works if the session ended during the countdown.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '@/src/background/browser-adapter';
import {
  FRICTION_COUNTDOWN_SECONDS,
  frictionDoneUrl,
  parseFrictionPage,
  type FrictionPage,
} from '@/src/interventions/friction';
import type { SessionMessage, SessionReply } from '@/src/sessions/messages';
import {
  ACTIVE_SESSION_KEY,
  SESSION_HISTORY_KEY,
  asActiveSession,
  asHistory,
} from '@/src/storage/sessions-store';

const page: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#f6f8fa',
  fontFamily: 'system-ui, sans-serif',
  color: '#1f2328',
  padding: 16,
  boxSizing: 'border-box',
};
const card: CSSProperties = {
  background: '#fff',
  border: '1px solid #d0d7de',
  borderRadius: 12,
  padding: 32,
  maxWidth: 440,
  width: '100%',
  textAlign: 'center',
  boxSizing: 'border-box',
};
const button: CSSProperties = { fontSize: 15, padding: '8px 16px', cursor: 'pointer' };
const muted: CSSProperties = { color: '#57606a', fontSize: 14 };

const SEND_ATTEMPTS = 3;
const RETRY_MS = 400;

/**
 * Tells the background about a choice. Retries a little, because a suspended background script
 * can take a moment to wake up. Never throws: the user's navigation must not depend on it.
 */
async function report(
  type: 'friction:continue' | 'friction:back',
  sessionId: string,
  hostname: string,
) {
  const message: SessionMessage = { type, sessionId, hostname };
  for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt++) {
    try {
      const reply = (await browser.runtime.sendMessage(message)) as SessionReply | undefined;
      if (reply?.ok) return;
    } catch {
      // Background not reachable yet: try again.
    }
    if (attempt < SEND_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  console.warn('[StudyLens] could not record the friction choice');
}

/** The goal of the session this page belongs to (running or, if it ended, finished). */
function useGoal(sessionId: string): string | null {
  const [goal, setGoal] = useState<string | null>(null);
  useEffect(() => {
    void localStore
      .get([ACTIVE_SESSION_KEY, SESSION_HISTORY_KEY])
      .then((stored) => {
        const active = asActiveSession(stored[ACTIVE_SESSION_KEY]);
        const session =
          active?.id === sessionId
            ? active
            : asHistory(stored[SESSION_HISTORY_KEY]).find((s) => s.id === sessionId);
        setGoal(session?.goal ?? null);
      })
      .catch(() => setGoal(null));
  }, [sessionId]);
  return goal;
}

function Goal({ sessionId }: { sessionId: string }) {
  const goal = useGoal(sessionId);
  if (!goal) return null;
  return (
    <p style={{ fontSize: 16 }}>
      Your goal: <strong>{goal}</strong>
    </p>
  );
}

function useSecondsLeft(total: number): number {
  const [left, setLeft] = useState(total);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const next = Math.max(0, total - Math.floor((Date.now() - start) / 1000));
      setLeft(next);
      if (next === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [total]);
  return left;
}

function Countdown({ info }: { info: Extract<FrictionPage, { mode: 'countdown' }> }) {
  const left = useSecondsLeft(FRICTION_COUNTDOWN_SECONDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `StudyLens — a moment before ${info.hostname}`;
  }, [info.hostname]);

  async function onContinue() {
    setBusy(true);
    await report('friction:continue', info.sessionId, info.hostname);
    window.location.replace(info.target);
  }

  async function onBack() {
    setBusy(true);
    await report('friction:back', info.sessionId, info.hostname);
    const done = frictionDoneUrl(window.location.href.split('?')[0] ?? '', info.sessionId);
    if (window.history.length > 1) {
      // If going back does nothing (no earlier page), show the "back to studying" page.
      const fallback = setTimeout(() => window.location.replace(done), 1500);
      window.addEventListener('pagehide', () => clearTimeout(fallback), { once: true });
      window.history.back();
    } else {
      window.location.replace(done);
    }
  }

  return (
    <main style={card}>
      <p style={{ ...muted, margin: 0 }}>StudyLens · focus session</p>
      <h1 style={{ fontSize: 22, margin: '8px 0 0' }}>
        A moment before <span style={{ overflowWrap: 'anywhere' }}>{info.hostname}</span>
      </h1>
      <Goal sessionId={info.sessionId} />
      <p
        role="timer"
        aria-label="Seconds left"
        style={{ fontSize: 48, fontWeight: 700, margin: '16px 0', color: '#0969da' }}
      >
        {left}
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        <button
          type="button"
          style={{
            ...button,
            background: '#1a7f37',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
          }}
          disabled={busy}
          onClick={() => void onBack()}
        >
          Back to studying
        </button>
        {left === 0 ? (
          <button type="button" style={button} disabled={busy} onClick={() => void onContinue()}>
            Continue to {info.hostname}
          </button>
        ) : (
          <p style={{ ...muted, margin: 0 }}>
            You can continue to {info.hostname} in {left} second{left === 1 ? '' : 's'}.
          </p>
        )}
      </div>
    </main>
  );
}

function Done({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    document.title = 'StudyLens — back to studying';
  }, []);
  return (
    <main style={card}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Back to studying</h1>
      <Goal sessionId={sessionId} />
      <p style={muted}>You can close this tab.</p>
    </main>
  );
}

export default function App() {
  const info = parseFrictionPage(window.location.search);
  return (
    <div style={page}>
      {info?.mode === 'countdown' && <Countdown info={info} />}
      {info?.mode === 'done' && <Done sessionId={info.sessionId} />}
      {!info && (
        <main style={card}>
          <h1 style={{ fontSize: 22, margin: 0 }}>StudyLens</h1>
          <p style={muted}>This page is missing its details. You can close this tab.</p>
        </main>
      )}
    </div>
  );
}
