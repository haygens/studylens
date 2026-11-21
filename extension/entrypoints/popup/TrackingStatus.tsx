/**
 * Popup: tracking status (P6, redesigned in P13b). A small pill in the header shows that
 * tracking is on and pauses it; while paused, a clear banner explains it and offers Resume.
 * A running focus session keeps its timer while paused, but nothing is recorded.
 */
import { useTrackingPaused } from '@/src/ui/use-tracking-paused';
import { PauseIcon } from '@/src/ui/icons';
import { LoadError } from './LoadStatus';

export function TrackingPill() {
  const { state, setPaused } = useTrackingPaused();
  if (state.status === 'error') return null; // The banner below shows the error.
  if (state.status === 'ready' && state.data) {
    return (
      <span className="sl-pill sl-pill-paused">
        <PauseIcon /> Paused
      </span>
    );
  }
  return (
    <button
      type="button"
      className="sl-pill sl-pill-on"
      disabled={state.status === 'loading'}
      aria-label="Tracking on. Pause tracking"
      title="Pause tracking"
      onClick={() => setPaused(true)}
    >
      <span className="sl-dot" aria-hidden="true" />
      Tracking on · Pause
    </button>
  );
}

export function PausedBanner() {
  const { state, setPaused, saveError, retry } = useTrackingPaused();
  if (state.status === 'error') {
    return <LoadError what="Tracking setting" message={state.message} onRetry={retry} />;
  }
  const paused = state.status === 'ready' && state.data;
  return (
    <>
      {paused && (
        <div role="status" className="sl-banner sl-banner-warn">
          <strong>Tracking paused</strong>
          <span>StudyLens isn&apos;t recording any sites. A running session keeps its timer.</span>
          <div>
            <button type="button" onClick={() => setPaused(false)}>
              Resume tracking
            </button>
          </div>
        </div>
      )}
      {saveError && (
        <p role="alert" className="sl-error" style={{ margin: 0 }}>
          {saveError}
        </p>
      )}
    </>
  );
}
