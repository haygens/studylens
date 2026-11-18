/**
 * One-time notice about research interventions (P8, on by default from v0.2.0), shown when the
 * popup opens while the feature is on. It keeps showing every time the popup opens until the user
 * presses "Keep on" or "Turn off": closing the popup without choosing doesn't count as seen, and no
 * focus session can start until then (the Start button waits, and the background refuses too).
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
        StudyLens is testing which focus helpers work. Each focus session now gets one of these at
        random, and you won’t know which in advance:
      </span>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong>Nothing changes</strong> (the comparison group).
        </li>
        <li>
          <strong>A short wait:</strong> opening a site you labeled Distraction shows a 10-second
          countdown first.
        </li>
        <li>
          <strong>A question:</strong> opening a site you labeled Distraction first asks “What did
          you come here for?” StudyLens never saves what you type.
        </li>
      </ul>
      <span>
        Only the helper’s name and a few counts are saved, on this device only. Nothing is sent
        anywhere. You can turn this off anytime on the My Data page. Choose one to start a session:
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
