import ErrorBoundary from './ErrorBoundary';
import FocusSession from './FocusSession';
import InterventionsNotice from './InterventionsNotice';
import PopupFooter from './PopupFooter';
import TodayActivity from './TodayActivity';
import { PausedBanner, TrackingPill } from './TrackingStatus';
import WhatsNew from './WhatsNew';

export default function App() {
  return (
    <main className="sl-popup">
      <header className="sl-pop-head">
        <img src="/icon/48.png" alt="" width={28} height={28} className="sl-logo" />
        <h1 className="sl-brand">StudyLens</h1>
        <ErrorBoundary name="Tracking">
          <TrackingPill />
        </ErrorBoundary>
      </header>
      <ErrorBoundary name="Tracking">
        <PausedBanner />
      </ErrorBoundary>
      <ErrorBoundary name="What's new">
        <WhatsNew />
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
      <PopupFooter />
    </main>
  );
}
