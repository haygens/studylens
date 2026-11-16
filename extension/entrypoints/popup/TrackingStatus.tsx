/**
 * Popup: pause/resume tracking and a link to the My Data page (P6). While paused, a clear
 * "Tracking paused" banner shows; a running focus session keeps its timer but records nothing.
 */
import { browser } from 'wxt/browser';
import { useTrackingPaused } from '@/src/ui/use-tracking-paused';
import { LoadError } from './LoadStatus';

function openMyData() {
  void browser.tabs
    .create({ url: `${browser.runtime.getURL('/options.html')}#my-data` })
    .then(() => window.close());
}

export default function TrackingStatus() {
  const { state, setPaused, saveError, retry } = useTrackingPaused();

  const myDataLink = (
    <button
      type="button"
      onClick={openMyData}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: '#0969da',
        cursor: 'pointer',
        fontSize: 12,
        textDecoration: 'underline',
      }}
    >
      My Data
    </button>
  );

  if (state.status === 'error') {
    return <LoadError what="Tracking setting" message={state.message} onRetry={retry} />;
  }
  const paused = state.status === 'ready' && state.data;

  return (
    <div style={{ marginTop: 10, fontSize: 12 }}>
      {paused ? (
        <div
          role="status"
          style={{
            padding: 8,
            borderRadius: 6,
            background: '#fff8c5',
            border: '1px solid #d4a72c',
            display: 'grid',
            gap: 6,
          }}
        >
          <strong style={{ fontSize: 13 }}>Tracking paused</strong>
          <span>StudyLens isn't recording any sites. A running session keeps its timer.</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={() => setPaused(false)}>
              Resume tracking
            </button>
            {myDataLink}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            disabled={state.status === 'loading'}
            onClick={() => setPaused(true)}
            style={{ fontSize: 12 }}
          >
            Pause tracking
          </button>
          {myDataLink}
        </div>
      )}
      {saveError && <div style={{ color: '#cf222e', marginTop: 4 }}>{saveError}</div>}
    </div>
  );
}
