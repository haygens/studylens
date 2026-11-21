/**
 * Interstitial page shared by the friction (P9) and intention (P10) interventions. The background
 * sends a tab here when the user enters a Distraction site during a `friction` or `intention`
 * session. Both modes show the site and the session goal, and "Back to studying" works right away.
 * - friction:  a 10-second countdown, then "Continue to <site>".
 * - intention: "What did you come here for?"; "Continue to <site>" enables once at least
 *   3 non-space characters are typed AND 10 seconds have passed (the same wait as friction, so
 *   both helpers cost the same time — P13c). A small hint shows the seconds left.
 *
 * Privacy: the full target address is only in this page's own address (so Continue can go
 * there). It is never stored, logged or sent: the background gets only the mode, session id and
 * hostname (see choiceMessage). The intention answer lives only in this page's memory while it is
 * open: it is never stored, logged or sent, browser autofill is off for the box, and the box is
 * emptied before the page navigates away.
 * Works even if the background script was suspended meanwhile (messages wake it up), and
 * Continue still works if the session ended while the page was open.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { browser } from 'wxt/browser';
import { localStore } from '@/src/background/browser-adapter';
import {
  FRICTION_COUNTDOWN_SECONDS,
  choiceMessage,
  interstitialDoneUrl,
  intentionCanContinue,
  intentionHint,
  intentionReady,
  INTENTION_MIN_SECONDS,
  parseInterstitialPage,
  type InterstitialChoice,
  type InterstitialPage,
} from '@/src/interventions/interstitial';
import type { SessionReply } from '@/src/sessions/messages';
import {
  ACTIVE_SESSION_KEY,
  SESSION_HISTORY_KEY,
  asActiveSession,
  asHistory,
} from '@/src/storage/sessions-store';
import { BackIcon, BoltIcon, SparkleIcon } from '@/src/ui/icons';

type PromptPage = Extract<InterstitialPage, { kind: 'prompt' }>;

const page: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(160deg, var(--sl-helper-bg), var(--sl-helper-bg-2))',
  color: 'var(--sl-ink)',
  padding: 16,
  boxSizing: 'border-box',
};
const card: CSSProperties = {
  background: 'var(--sl-surface)',
  border: 'var(--sl-border-w) solid var(--sl-border)',
  borderRadius: 'calc(var(--sl-radius) + 4px)',
  boxShadow: 'var(--sl-shadow)',
  padding: 32,
  maxWidth: 440,
  width: '100%',
  textAlign: 'center',
  boxSizing: 'border-box',
};
const button: CSSProperties = {
  fontSize: 'var(--sl-fs-h3)',
  padding: '8px 16px',
  cursor: 'pointer',
};
const muted: CSSProperties = { color: 'var(--sl-muted)', fontSize: 'var(--sl-fs-body)' };

const SEND_ATTEMPTS = 3;
const RETRY_MS = 400;

/**
 * Tells the background about a choice. Retries a little, because a suspended background script
 * can take a moment to wake up. Never throws: the user's navigation must not depend on it.
 */
async function report(info: PromptPage, choice: InterstitialChoice) {
  const message = choiceMessage(info, choice);
  for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt++) {
    try {
      const reply = (await browser.runtime.sendMessage(message)) as SessionReply | undefined;
      if (reply?.ok) return;
    } catch {
      // Background not reachable yet: try again.
    }
    if (attempt < SEND_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  console.warn('[StudyLens] could not record the choice');
}

/** "Continue" and "Back to studying", shared by both modes. `beforeLeave` runs first. */
function useChoices(info: PromptPage, beforeLeave: () => void = () => {}) {
  const [busy, setBusy] = useState(false);

  async function onContinue() {
    setBusy(true);
    beforeLeave();
    await report(info, 'continue');
    window.location.replace(info.target);
  }

  async function onBack() {
    setBusy(true);
    beforeLeave();
    await report(info, 'back');
    const done = interstitialDoneUrl(window.location.href.split('?')[0] ?? '', info.sessionId);
    if (window.history.length > 1) {
      // If going back does nothing (no earlier page), show the "back to studying" page.
      const fallback = setTimeout(() => window.location.replace(done), 1500);
      window.addEventListener('pagehide', () => clearTimeout(fallback), { once: true });
      window.history.back();
    } else {
      window.location.replace(done);
    }
  }

  return { busy, onContinue: () => void onContinue(), onBack: () => void onBack() };
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
    <p style={{ fontSize: 'var(--sl-fs-h3)' }}>
      Your goal: <strong>{goal}</strong>
    </p>
  );
}

function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
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

/** The card both modes share: header, heading, goal, then the mode's own content. */
function Card({
  info,
  heading,
  children,
}: {
  info: PromptPage;
  heading: ReactNode;
  children: ReactNode;
}) {
  return (
    <main style={card} className="sl-pop-in">
      <p className="sl-row" style={{ ...muted, margin: 0, justifyContent: 'center', gap: 8 }}>
        <img src="/icon/32.png" alt="" width={22} height={22} className="sl-logo" />
        StudyLens · focus session
      </p>
      <h1 style={{ fontSize: 'var(--sl-fs-h1)', margin: '10px 0 0', overflowWrap: 'anywhere' }}>
        {heading}
      </h1>
      <Goal sessionId={info.sessionId} />
      {children}
    </main>
  );
}

/** The site name, in the theme's Distraction color (with the bolt icon, never color alone). */
function Host({ name }: { name: string }) {
  return (
    <span className="sl-text-distraction" style={{ whiteSpace: 'nowrap' }}>
      <BoltIcon /> {name}
    </span>
  );
}

function BackButton({ busy, onBack }: { busy: boolean; onBack: () => void }) {
  return (
    <button
      type="button"
      className="sl-btn-primary sl-btn-big"
      disabled={busy}
      onClick={onBack}
      style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
    >
      <BackIcon />
      Back to studying
    </button>
  );
}

const RING_RADIUS = 46;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function Friction({ info }: { info: PromptPage }) {
  const left = useSecondsLeft(FRICTION_COUNTDOWN_SECONDS);
  const { busy, onContinue, onBack } = useChoices(info);
  const waitId = useId();
  useTitle(`StudyLens — a moment before ${info.hostname}`);

  return (
    <Card
      info={info}
      heading={
        <>
          A moment before <Host name={info.hostname} />
        </>
      }
    >
      <div className="sl-ring" style={{ width: 120, height: 120, margin: '16px auto 4px' }}>
        <svg viewBox="0 0 110 110" aria-hidden="true">
          <circle className="sl-ring-track" cx="55" cy="55" r={RING_RADIUS} />
          <circle
            className="sl-ring-fill"
            style={{ stroke: 'var(--sl-friction-ring)' }}
            cx="55"
            cy="55"
            r={RING_RADIUS}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (left / FRICTION_COUNTDOWN_SECONDS)}
            transform="rotate(-90 55 55)"
          />
        </svg>
        <p
          role="timer"
          aria-label="Seconds left"
          className="sl-ring-text"
          style={{ margin: 0, fontSize: 44, fontWeight: 800, color: 'var(--sl-friction)' }}
        >
          {left}
        </p>
      </div>
      <p style={{ ...muted, margin: '0 0 16px', fontSize: 'var(--sl-fs-h3)' }}>
        Take a breath. Do you still need this site?
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        <BackButton busy={busy} onBack={onBack} />
        {left === 0 ? (
          <button type="button" style={button} disabled={busy} onClick={onContinue}>
            Continue to {info.hostname}
          </button>
        ) : (
          <p id={waitId} className="sl-wait" role="note">
            You can continue to {info.hostname} in {left} second{left === 1 ? '' : 's'}.
          </p>
        )}
      </div>
    </Card>
  );
}

function Intention({ info }: { info: PromptPage }) {
  // The answer exists only here, in this component's memory. It is never stored, logged or sent.
  const [answer, setAnswer] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const id = useId();
  // Empty the box before leaving, so the browser can't keep the text with the page's history.
  const clear = () => {
    flushSync(() => setAnswer(''));
    if (box.current) box.current.value = '';
  };
  const { busy, onContinue, onBack } = useChoices(info, clear);
  const left = useSecondsLeft(INTENTION_MIN_SECONDS);
  const typed = intentionReady(answer);
  const ready = intentionCanContinue(answer, left);
  const hintId = useId();
  useTitle(`StudyLens — before ${info.hostname}`);

  useEffect(() => {
    const onHide = () => {
      if (box.current) box.current.value = '';
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  return (
    <Card
      info={info}
      heading={
        <>
          Before you open <Host name={info.hostname} />
        </>
      }
    >
      <div style={{ display: 'grid', gap: 10, textAlign: 'left' }}>
        <label htmlFor={id} style={{ fontSize: 'var(--sl-fs-h1)', fontWeight: 750 }}>
          What did you come here for?
        </label>
        <input
          id={id}
          ref={box}
          type="text"
          value={answer}
          maxLength={200}
          autoComplete="off"
          autoFocus
          disabled={busy}
          style={{ fontSize: 'var(--sl-fs-h3)', padding: '8px 10px' }}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready && !busy) onContinue();
          }}
        />
        <p style={{ ...muted, margin: 0, fontSize: 'var(--sl-fs-small)' }}>
          Your answer is just for you: StudyLens never saves or sends it.
        </p>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <BackButton busy={busy} onBack={onBack} />
        <button
          type="button"
          style={button}
          disabled={busy || !ready}
          aria-describedby={ready ? undefined : hintId}
          onClick={onContinue}
        >
          Continue to {info.hostname}
        </button>
        {!ready && (
          <p id={hintId} role="note" className="sl-wait">
            {intentionHint(typed, left)}
          </p>
        )}
      </div>
    </Card>
  );
}

function Done({ sessionId }: { sessionId: string }) {
  useTitle('StudyLens — back to studying');
  return (
    <main style={card} className="sl-pop-in">
      <p style={{ fontSize: 40, margin: 0, color: 'var(--sl-celebrate)' }} aria-hidden="true">
        <SparkleIcon />
      </p>
      <h1 style={{ fontSize: 'var(--sl-fs-h1)', margin: '4px 0 0' }}>Back to studying</h1>
      <p style={{ color: 'var(--sl-celebrate)', fontWeight: 700, margin: '6px 0 0' }}>Nice save!</p>
      <Goal sessionId={sessionId} />
      <button type="button" style={button} onClick={() => window.close()}>
        Close this tab
      </button>
    </main>
  );
}

export default function App() {
  const info = parseInterstitialPage(window.location.search);
  return (
    <div style={page}>
      {info?.kind === 'prompt' && info.mode === 'friction' && <Friction info={info} />}
      {info?.kind === 'prompt' && info.mode === 'intention' && <Intention info={info} />}
      {info?.kind === 'done' && <Done sessionId={info.sessionId} />}
      {!info && (
        <main style={card}>
          <h1 style={{ fontSize: 'var(--sl-fs-h2)', margin: 0 }}>StudyLens</h1>
          <p style={muted}>This page is missing its details. You can close this tab.</p>
        </main>
      )}
    </div>
  );
}
