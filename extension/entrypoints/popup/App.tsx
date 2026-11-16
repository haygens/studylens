import { appTitle } from '@/src/title';
import DebugActivity from './DebugActivity';
import ErrorBoundary from './ErrorBoundary';
import FocusSession from './FocusSession';
import TrackingStatus from './TrackingStatus';

export default function App() {
  return (
    <main style={{ padding: 16, width: 300, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>{appTitle()}</h1>
      <ErrorBoundary name="Tracking">
        <TrackingStatus />
      </ErrorBoundary>
      <ErrorBoundary name="Focus session">
        <FocusSession />
      </ErrorBoundary>
      {/* TEMPORARY: remove in P6 (My Data page). */}
      <ErrorBoundary name="Debug view">
        <DebugActivity />
      </ErrorBoundary>
    </main>
  );
}
