/**
 * React hook for the "pause tracking" setting (P6), shared by the popup and the My Data page.
 * Reads `tracking:paused`, follows changes from other pages, and writes it. The background
 * script listens for the same storage change and stops or restarts recording.
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '../background/browser-adapter';
import { settle, LOAD_TIMEOUT_MS, type LoadState } from '../popup/popup-data';
import { PAUSED_KEY, isTrackingPaused, setTrackingPaused } from '../storage/activity-store';

export function useTrackingPaused() {
  const [state, setState] = useState<LoadState<boolean>>({ status: 'loading' });
  const [saveError, setSaveError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void settle(isTrackingPaused(localStore), LOAD_TIMEOUT_MS).then(setState);
  }, []);

  useEffect(() => {
    reload();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && PAUSED_KEY in changes) reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  const setPaused = useCallback(
    (paused: boolean) => {
      setSaveError(null);
      setState({ status: 'ready', data: paused });
      setTrackingPaused(localStore, paused).catch((err: unknown) => {
        console.error('[StudyLens] could not save pause setting', err);
        setSaveError('Could not save. Try again.');
        reload();
      });
    },
    [reload],
  );

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    reload();
  }, [reload]);

  return { state, setPaused, saveError, retry };
}
