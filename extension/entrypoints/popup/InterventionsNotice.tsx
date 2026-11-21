/**
 * One-time notice about research interventions (P8, on by default from v0.2.0; shortened in
 * P13b, with the full explanation on the Settings tab and the welcome page), shown when the
 * popup opens while the feature is on. It keeps showing every time the popup opens until the user
 * presses "Keep on" or "Turn off": closing the popup without choosing doesn't count as seen, and no
 * focus session can start until then (the Start button waits, and the background refuses too).
 */
import { useState } from 'react';
import { browser } from 'wxt/browser';
import { SparkleIcon } from '@/src/ui/icons';
import { shouldShowNotice } from '@/src/storage/interventions-store';
import { useInterventions } from '@/src/ui/use-interventions';

function openSettings() {
  void browser.tabs
    .create({ url: `${browser.runtime.getURL('/options.html')}#settings` })
    .then(() => window.close());
}

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
    <div role="dialog" aria-label="Research interventions" className="sl-banner sl-banner-info">
      <strong className="sl-row" style={{ gap: 6 }}>
        <SparkleIcon />
        New: focus helpers
      </strong>
      <span>
        To learn what helps students focus, each session may get a helper at random: a short wait or
        a question (“What did you come here for?”) before sites you labeled Distraction. StudyLens
        never saves what you type, and nothing leaves this device.
      </span>
      <div className="sl-row">
        <button type="button" className="sl-btn-primary" onClick={() => choose(true)}>
          Keep on
        </button>
        <button type="button" onClick={() => choose(false)}>
          Turn off
        </button>
        <button
          type="button"
          className="sl-link"
          style={{ marginLeft: 'auto' }}
          onClick={openSettings}
        >
          Learn more
        </button>
      </div>
      {saveError && <span className="sl-error">{saveError}</span>}
    </div>
  );
}
