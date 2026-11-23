import { describeDbContract } from './contract';
import { createMemoryDb } from './memory';

describeDbContract('memory', async () => {
  const db = createMemoryDb();
  return { db, dispose: () => db.close() };
});
