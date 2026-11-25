/**
 * End-of-session check-in (P5). Shown instead of the Start form while the latest session's
 * check-in is waiting. Answers go to the background script, which validates and saves them on
 * the session; the popup then reloads from storage and shows the Start form again.
 */
import { useId, useState, type FormEvent } from 'react';
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
import { checkInBlockReason } from '@/src/popup/popup-view';
import SessionComplete from './SessionComplete';
import { LiveSummary } from '@/src/ui/live';
import { CheckIcon, CrossIcon, HalfIcon, InfoIcon, ShieldIcon } from '@/src/ui/icons';

const GOAL_ICONS = { yes: CheckIcon, partly: HalfIcon, no: CrossIcon } as const;

const ERROR_TEXT: Record<string, string> = {
  'not-pending': 'This check-in is no longer open.',
  'invalid-answer': 'Pick an answer for both questions.',
  unknown: 'Something went wrong. Try again.',
};

async function send(message: SessionMessage): Promise<SessionReply> {
  return (await browser.runtime.sendMessage(message)) as SessionReply;
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

  const reason = checkInBlockReason(goal !== null, rating !== null);
  const reasonId = useId();

  return (
    <form onSubmit={onSubmit} className="sl-card sl-stack" aria-label="Session check-in">
      <SessionComplete session={session} />
      {session.group && <LiveSummary sessionId={session.group.sessionId} />}

      <fieldset className="sl-field">
        <legend>Did you finish your goal?</legend>
        <div className="sl-row" style={{ gap: 6 }}>
          {GOAL_COMPLETED_VALUES.map((value) => {
            const Icon = GOAL_ICONS[value];
            return (
              <button
                key={value}
                type="button"
                aria-pressed={goal === value}
                className={`sl-pick${value === 'yes' ? ' sl-pick-yes' : ''}`}
                onClick={() => setGoal(value)}
              >
                <Icon />
                {GOAL_LABELS[value]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="sl-field">
        <legend>How focused were you?</legend>
        <div className="sl-row" style={{ gap: 6 }}>
          {FOCUS_RATINGS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rating === value}
              aria-label={`${value} – ${FOCUS_LABELS[value]}`}
              title={FOCUS_LABELS[value]}
              className="sl-pick"
              onClick={() => setRating(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="sl-row-between sl-muted sl-small" style={{ fontWeight: 400 }}>
          <span>1 = {FOCUS_LABELS[1]}</span>
          <span>5 = {FOCUS_LABELS[5]}</span>
        </div>
      </fieldset>

      <div className="sl-row">
        <button
          type="submit"
          className="sl-btn-primary"
          disabled={reason !== null || busy}
          aria-describedby={reason ? reasonId : undefined}
          style={{ flex: 1 }}
        >
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
      {reason && (
        <p role="note" id={reasonId} className="sl-hint">
          <InfoIcon />
          {reason}
        </p>
      )}
      {error && (
        <p role="alert" className="sl-error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <p className="sl-hint">
        <ShieldIcon />
        Your answers stay on this device.
      </p>
    </form>
  );
}
