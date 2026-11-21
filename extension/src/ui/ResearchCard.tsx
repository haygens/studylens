/**
 * "Research interventions" on/off setting (P8), shown on the My Data page and the options page's
 * Settings tab.
 */
import type { CSSProperties } from 'react';
import { LoadError } from '../../entrypoints/popup/LoadStatus';
import { useInterventions } from './use-interventions';

const card: CSSProperties = {
  background: 'var(--sl-surface)',
  border: 'var(--sl-border-w) solid var(--sl-border)',
  borderRadius: 'var(--sl-radius)',
  boxShadow: 'var(--sl-card-shadow)',
  padding: 16,
  marginTop: 16,
};
const muted: CSSProperties = { color: 'var(--sl-muted)', fontSize: 'var(--sl-fs-small)' };

export default function ResearchCard() {
  const { state, setParticipating, saveError, retry } = useInterventions();
  if (state.status === 'error') {
    return <LoadError what="Research setting" message={state.message} onRetry={retry} />;
  }
  const ready = state.status === 'ready' ? state.data : null;
  const on = ready ? !ready.optedOut : false;

  return (
    <section style={card} aria-label="Research interventions">
      <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Research interventions</h2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={on}
          disabled={!ready}
          onChange={(e) => setParticipating(e.target.checked)}
        />
        Take part in research interventions
      </label>
      <p style={{ ...muted, marginBottom: 4 }}>
        StudyLens is testing which focus helpers actually work. When this is on, each focus session
        is given one of three helpers at random, and you won’t know which one in advance:
      </p>
      <ul style={{ ...muted, margin: 0, paddingLeft: 20 }}>
        <li>
          <strong>Control:</strong> nothing changes.
        </li>
        <li>
          <strong>Friction:</strong> opening a site you labeled Distraction shows a 10-second
          countdown before the site loads.
        </li>
        <li>
          <strong>Intention:</strong> opening a site you labeled Distraction first asks “What did
          you come here for?” StudyLens never saves, logs or sends what you type: only how many
          times the question was shown and which button you pressed are counted.
        </li>
      </ul>
      <p style={{ ...muted, marginBottom: 0 }}>
        Which helper a session got is saved with the session, so you can see it in the Focus
        sessions table on My Data. You can turn this off at any time; sessions after that are marked
        “opted out” and get no helper. Nothing is sent anywhere.
      </p>
      {ready && !ready.enabled && (
        <p style={{ ...muted, marginBottom: 0 }} role="note">
          <strong>Switched off:</strong> research interventions are switched off in this browser, so
          sessions get no helper, whatever this setting says.
        </p>
      )}
      {saveError && (
        <p style={{ color: 'var(--sl-distraction)', fontSize: 'var(--sl-fs-small)' }}>
          {saveError}
        </p>
      )}
    </section>
  );
}
