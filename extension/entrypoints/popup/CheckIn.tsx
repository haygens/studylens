/**
 * End-of-session check-in (P5). Shown instead of the Start form while the latest session's
 * check-in is waiting. Answers go to the background script, which validates and saves them on
 * the session; the popup then reloads from storage and shows the Start form again.
 */
import { useState, type CSSProperties, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import {
  FOCUS_RATINGS,
  GOAL_COMPLETED_VALUES,
  type FocusRating,
  type GoalCompleted,
} from '@studylens/shared';
import { FOCUS_LABELS, GOAL_LABELS } from '@/src/sessions/check-in';
import type { SessionMessage, SessionReply } from '@/src/sessions/messages';
import type { FocusSession } from '@/src/sessions/session';

const ERROR_TEXT: Record<string, string> = {
  'not-pending': 'This check-in is no longer open.',
  'invalid-answer': 'Pick an answer for both questions.',
  unknown: 'Something went wrong. Try again.',
};

async function send(message: SessionMessage): Promise<SessionReply> {
  return (await browser.runtime.sendMessage(message)) as SessionReply;
}

function choiceStyle(selected: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '6px 0',
    fontSize: 'var(--sl-fs-small)',
    border: `1px solid ${selected ? 'var(--sl-primary)' : 'var(--sl-border)'}`,
    background: selected ? 'var(--sl-primary-soft)' : 'var(--sl-bg)',
    fontWeight: selected ? 600 : 400,
    borderRadius: 6,
    cursor: 'pointer',
  };
}

export default function CheckIn({
  session,
  onClosed,
}: {
  session: FocusSession;
  /** Called when the background says this check-in is no longer open (so the popup reloads). */
  onClosed: () => void;
}) {
  const [goal, setGoal] = useState<GoalCompleted | null>(null);
  const [rating, setRating] = useState<FocusRating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(message: SessionMessage) {
    setBusy(true);
    setError(null);
    try {
      const reply = await send(message);
      if (!reply.ok) {
        setError(ERROR_TEXT[reply.error] ?? ERROR_TEXT.unknown!);
        if (reply.error === 'not-pending') onClosed();
      }
      // On success the storage change reloads the popup into the Start form.
    } catch {
      setError(ERROR_TEXT.unknown!);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!goal || !rating || busy) return;
    void submit({
      type: 'checkin:answer',
      sessionId: session.id,
      goalCompleted: goal,
      focusRating: rating,
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }} aria-label="Session check-in">
      <div>
        <div style={{ fontSize: 'var(--sl-fs-small)', color: 'var(--sl-muted)' }}>
          Session over{session.endedEarly ? ' (ended early)' : ''}. Your goal was
        </div>
        <div style={{ fontSize: 'var(--sl-fs-h3)', fontWeight: 600, overflowWrap: 'anywhere' }}>
          {session.goal}
        </div>
      </div>

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 'var(--sl-fs-small)', marginBottom: 4 }}>
          Did you finish your goal?
        </legend>
        <div style={{ display: 'flex', gap: 6 }}>
          {GOAL_COMPLETED_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={goal === value}
              style={choiceStyle(goal === value)}
              onClick={() => setGoal(value)}
            >
              {GOAL_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 'var(--sl-fs-small)', marginBottom: 4 }}>
          How focused were you?
        </legend>
        <div style={{ display: 'flex', gap: 6 }}>
          {FOCUS_RATINGS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rating === value}
              aria-label={`${value} – ${FOCUS_LABELS[value]}`}
              title={FOCUS_LABELS[value]}
              style={choiceStyle(rating === value)}
              onClick={() => setRating(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--sl-fs-small)',
            color: 'var(--sl-muted)',
            marginTop: 2,
          }}
        >
          <span>1 = {FOCUS_LABELS[1]}</span>
          <span>5 = {FOCUS_LABELS[5]}</span>
        </div>
      </fieldset>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={!goal || !rating || busy} style={{ flex: 1 }}>
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit({ type: 'checkin:skip', sessionId: session.id })}
        >
          Skip
        </button>
      </div>
      {error && (
        <div style={{ color: 'var(--sl-distraction)', fontSize: 'var(--sl-fs-small)' }}>
          {error}
        </div>
      )}
      <div style={{ fontSize: 'var(--sl-fs-small)', color: 'var(--sl-muted)' }}>
        Your answers stay on this device.
      </div>
    </form>
  );
}
