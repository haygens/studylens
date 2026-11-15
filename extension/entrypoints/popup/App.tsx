import { appTitle } from '@/src/title';

export default function App() {
  return (
    <main style={{ padding: 16, minWidth: 240, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>{appTitle()}</h1>
    </main>
  );
}
