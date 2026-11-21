/**
 * Study mode (P13c): "Lock my site labels", on the options page's Settings tab. While it is on,
 * site labels can't be edited, so every session in a study uses the same labels. Each switch
 * on/off is recorded with its time (shown on My Data and in the export).
 */
import { LoadError } from '../../entrypoints/popup/LoadStatus';
import { useLabelLock } from './use-label-lock';

export default function StudyModeCard() {
  const { state, setLocked, saveError, retry } = useLabelLock();
  if (state.status === 'error') {
    return <LoadError what="Study mode" message={state.message} onRetry={retry} />;
  }
  const lock = state.status === 'ready' ? state.data : null;
  return (
    <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-study-mode">
      <h2 id="sl-study-mode" style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>
        Study mode
      </h2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={lock?.locked ?? false}
          disabled={!lock}
          onChange={(e) => setLocked(e.target.checked)}
        />
        Lock my site labels (study mode)
      </label>
      <p className="sl-muted" style={{ marginBottom: 0 }}>
        {lock?.locked
          ? 'Your site labels are locked. They can’t be changed until you turn this off, so every focus session is measured with the same labels.'
          : 'Turn this on while you take part in a study, so your site labels stay the same from session to session. You can turn it off at any time.'}{' '}
        StudyLens saves when you turn it on or off (on this device only).
      </p>
      {saveError && (
        <p role="alert" style={{ color: 'var(--sl-distraction)', fontSize: 'var(--sl-fs-small)' }}>
          {saveError}
        </p>
      )}
    </section>
  );
}
