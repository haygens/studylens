/**
 * "Delete everything" (P6). Browser effects are injected so this is unit-testable.
 *
 * Removes every stored key (see keysToDelete), which also ends a running session without a
 * check-in, then stops the session alarms and clears the toolbar badge.
 */
import type { SessionEffects } from '../sessions/session-controller';
import type { FullStore } from '../storage/activity-store';
import { keysToDelete } from '../storage/keys';

export async function deleteEverything(store: FullStore, effects: SessionEffects): Promise<void> {
  await effects.clearAlarms();
  await store.remove(keysToDelete(await store.getAll()));
  await effects.setBadge('');
}
