import { appTitle } from '@/src/title';
import ErrorBoundary from './ErrorBoundary';
import FocusSession from './FocusSession';
import TodayActivity from './TodayActivity';
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
      <ErrorBoundary name="Today">
        <TodayActivity />
      </ErrorBoundary>
    </main>
  );
}
