/**
 * One-time notice about research interventions (P8), shown when the popup opens while the feature
 * is on. It keeps showing every time the popup opens until the user presses "Keep on" or "Turn
 * off": closing the popup without choosing doesn't count as seen.
 */
import { useState } from 'react';
import { shouldShowNotice } from '@/src/storage/interventions-store';
import { useInterventions } from '@/src/ui/use-interventions';

export default function InterventionsNotice() {
  const { state, answerNotice, saveError } = useInterventions();
  // Decided once per popup, so it stays up (e.g. while the answer is saving) until a button is pressed.
  const [show, setShow] = useState<boolean | null>(null);

  // Adjusting state while rendering (not in an effect) is React's recommended pattern here.
  if (show === null && state.status !== 'loading') {
    setShow(state.status === 'ready' && shouldShowNotice(state.data));
  }

  if (!show) return null;

  function choose(keepOn: boolean) {
    answerNotice(keepOn);
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
