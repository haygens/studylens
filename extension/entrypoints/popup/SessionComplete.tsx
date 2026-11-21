/**
 * A small, friendly "session complete" moment above the check-in (P13b): theme-colored, no
 * sound, and a few confetti pieces that fall once. With `prefers-reduced-motion`, the confetti
 * is hidden and nothing moves (see styles.css). Ended-early sessions get a kind word instead.
 */
import type { FocusSession } from '@/src/sessions/session';
import { formatWholeMinutes } from '@/src/popup/popup-view';
import { SparkleIcon } from '@/src/ui/icons';

const PIECES = 14;

export default function SessionComplete({ session }: { session: FocusSession }) {
  const focused = formatWholeMinutes(session.actualEnd - session.start);
  return (
    <div className="sl-celebrate sl-pop-in">
      {!session.endedEarly && (
        <div className="sl-confetti" aria-hidden="true">
          {Array.from({ length: PIECES }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${3 + i * 7}%`,
                animationDelay: `${(i % 5) * 0.15}s`,
                transform: `rotate(${i * 37}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <p className="sl-celebrate-title">
        <SparkleIcon />
        {session.endedEarly ? 'Session over. Nice effort!' : 'Session complete!'}
      </p>
      <p className="sl-muted" style={{ margin: '4px 0 0' }}>
        You focused for <b style={{ color: 'var(--sl-ink)' }}>{focused}</b>
        {session.endedEarly ? ' (ended early)' : ''}. Your goal was
      </p>
      <p className="sl-goal">{session.goal}</p>
    </div>
  );
}
