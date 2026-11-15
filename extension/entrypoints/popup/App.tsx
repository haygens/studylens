import { appTitle } from '@/src/title';
import DebugActivity from './DebugActivity';

export default function App() {
  return (
    <main style={{ padding: 16, minWidth: 280, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>{appTitle()}</h1>
      {/* TEMPORARY: remove in P4/P6. */}
      <DebugActivity />
    </main>
  );
}
