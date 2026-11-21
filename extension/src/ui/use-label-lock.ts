/**
 * React hook for study mode, "Lock my site labels" (P13c). Reads `study:label-lock`, follows
 * changes from other pages, and switches it (recording the time of every switch).
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '../background/browser-adapter';
import { settle, LOAD_TIMEOUT_MS, type LoadState } from '../popup/popup-data';
import {
  LABEL_LOCK_KEY,
  loadLabelLock,
  setLabelLock,
  switchLock,
  type LabelLock,
} from '../storage/research-store';

export function useLabelLock() {
  const [state, setState] = useState<LoadState<LabelLock>>({ status: 'loading' });
  const [saveError, setSaveError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void settle(loadLabelLock(localStore), LOAD_TIMEOUT_MS).then(setState);
  }, []);

  useEffect(() => {
    reload();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && LABEL_LOCK_KEY in changes) reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  const setLocked = useCallback(
    (locked: boolean) => {
      setSaveError(null);
      const now = Date.now();
      // Show the new state right away (a controlled checkbox must change on click).
      setState((s) => (s.status === 'ready' ? { ...s, data: switchLock(s.data, locked, now) } : s));
      setLabelLock(localStore, locked, now)
        .then((lock) => setState({ status: 'ready', data: lock }))
        .catch((err: unknown) => {
          console.error('[StudyLens] could not save study mode', err);
          setSaveError('Could not save. Try again.');
          reload();
        });
    },
    [reload],
  );

  return { state, setLocked, saveError, retry: reload };
}
