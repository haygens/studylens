import { appTitle } from '@/src/title';
import ErrorBoundary from './ErrorBoundary';
import FocusSession from './FocusSession';
import InterventionsNotice from './InterventionsNotice';
import TodayActivity from './TodayActivity';
import TrackingStatus from './TrackingStatus';

export default function App() {
  return (
    <main style={{ padding: 16, width: 300 }}>
      <h1 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>{appTitle()}</h1>
      <ErrorBoundary name="Tracking">
        <TrackingStatus />
      </ErrorBoundary>
      <ErrorBoundary name="Research notice">
        <InterventionsNotice />
      </ErrorBoundary>
      <ErrorBoundary name="Focus session">
        <FocusSession />
      </ErrorBoundary>
      <ErrorBoundary name="Today">
        <TodayActivity />
      </ErrorBoundary>
    </main>
  );
}
