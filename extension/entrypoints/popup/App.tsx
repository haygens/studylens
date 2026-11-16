import { appTitle } from '@/src/title';
import DebugActivity from './DebugActivity';
import FocusSession from './FocusSession';

export default function App() {
  return (
    <main style={{ padding: 16, width: 300, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>{appTitle()}</h1>
      <FocusSession />
      {/* TEMPORARY: remove in P6 (My Data page). */}
      <DebugActivity />
    </main>
  );
}
