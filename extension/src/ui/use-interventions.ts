/**
 * React hook for research interventions (P8): the feature flag, the user's on/off choice, and
 * whether the one-time popup notice was seen. Shared by the popup and the options page, and
 * follows changes made on other pages.
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '../background/browser-adapter';
import { settle, LOAD_TIMEOUT_MS, type LoadState } from '../popup/popup-data';
import {
  ENABLED_KEY,
  NOTICE_SEEN_KEY,
  OPTED_OUT_KEY,
  loadNoticeState,
  markNoticeSeen,
  setOptedOut,
  type NoticeState,
} from '../storage/interventions-store';

const WATCHED = [ENABLED_KEY, OPTED_OUT_KEY, NOTICE_SEEN_KEY];

export function useInterventions() {
  const [state, setState] = useState<LoadState<NoticeState>>({ status: 'loading' });
  const [saveError, setSaveError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void settle(loadNoticeState(localStore), LOAD_TIMEOUT_MS).then(setState);
  }, []);

  useEffect(() => {
    reload();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && WATCHED.some((k) => k in changes)) reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  const save = useCallback(
    (write: Promise<void>) => {
      setSaveError(null);
      write.catch((err: unknown) => {
        console.error('[StudyLens] could not save research setting', err);
        setSaveError('Could not save. Try again.');
        reload();
      });
    },
    [reload],
  );

  /** Turns research interventions on (`true`) or off for future sessions. */
  const setParticipating = useCallback(
    (on: boolean) => {
      setState((s) => (s.status === 'ready' ? { ...s, data: { ...s.data, optedOut: !on } } : s));
      save(setOptedOut(localStore, !on));
    },
    [save],
  );

  const noticeSeen = useCallback(() => save(markNoticeSeen(localStore)), [save]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    reload();
  }, [reload]);

  return { state, setParticipating, noticeSeen, saveError, retry };
}
