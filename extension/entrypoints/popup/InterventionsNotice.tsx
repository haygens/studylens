/**
 * One-time notice about research interventions (P8), shown the first time the popup opens while
 * the feature is on. It counts as seen as soon as it is shown, so it never appears again, even
 * if the popup is closed without pressing a button (interventions then stay on, the default).
 */
import { useEffect, useState } from 'react';
import { shouldShowNotice } from '@/src/storage/interventions-store';
import { useInterventions } from '@/src/ui/use-interventions';

export default function InterventionsNotice() {
  const { state, setParticipating, noticeSeen, saveError } = useInterventions();
  // Decided once per popup: stays up after it is marked seen until a button is pressed.
  const [show, setShow] = useState<boolean | null>(null);

  // Adjusting state while rendering (not in an effect) is React's recommended pattern here.
  if (show === null && state.status !== 'loading') {
    setShow(state.status === 'ready' && shouldShowNotice(state.data));
  }

  // Record that it was shown (a storage write, not React state).
  useEffect(() => {
    if (show) noticeSeen();
  }, [show, noticeSeen]);

  if (!show) return null;

  function choose(on: boolean) {
    if (!on) setParticipating(false);
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Research interventions"
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 6,
        background: '#ddf4ff',
        border: '1px solid #54aeff',
        fontSize: 12,
        display: 'grid',
        gap: 6,
      }}
    >
      <strong style={{ fontSize: 13 }}>New: research interventions</strong>
      <span>
        To learn which focus helpers work, each session now gets one at random: nothing, a short
        countdown before distraction sites, or a “What did you come here for?” prompt. It all stays
        on this device, and you can turn it off anytime on the My Data page.
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => choose(true)}>
          Keep on
        </button>
        <button type="button" onClick={() => choose(false)}>
          Turn off
        </button>
      </div>
      {saveError && <span style={{ color: '#cf222e' }}>{saveError}</span>}
    </div>
  );
}
