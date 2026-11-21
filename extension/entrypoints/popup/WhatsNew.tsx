/**
 * Popup hints from onboarding (P13b):
 * - after updating from 0.2.0: "New: themes!" with a link to Settings (once clicked or
 *   dismissed, it's gone);
 * - after a new install, until the welcome page is finished: "Finish setting up".
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localStore } from '@/src/background/browser-adapter';
import {
  THEMES_HINT_KEY,
  WELCOME_KEY,
  dismissThemesHint,
  loadOnboarding,
  type OnboardingState,
} from '@/src/storage/onboarding-store';
import { CrossIcon, SparkleIcon } from '@/src/ui/icons';

function openTab(path: '/options.html#settings' | '/welcome.html') {
  void browser.tabs.create({ url: browser.runtime.getURL(path) }).then(() => window.close());
}

export default function WhatsNew() {
  const [state, setState] = useState<OnboardingState | null>(null);

  const reload = useCallback(() => {
    void loadOnboarding(localStore).then(setState, () => setState(null));
  }, []);

  useEffect(() => {
    reload();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && (THEMES_HINT_KEY in changes || WELCOME_KEY in changes)) reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  if (!state) return null;

  if (state.themesHint) {
    const dismiss = () => {
      setState({ ...state, themesHint: false });
      void dismissThemesHint(localStore);
    };
    return (
      <div role="region" aria-label="What's new" className="sl-banner sl-banner-info sl-pop-in">
        <div className="sl-row-between">
          <strong className="sl-row" style={{ gap: 6 }}>
            <SparkleIcon />
            New: themes!
          </strong>
          <button
            type="button"
            className="sl-btn-quiet"
            aria-label="Dismiss"
            title="Dismiss"
            style={{ padding: '2px 6px', border: 'none' }}
            onClick={dismiss}
          >
            <CrossIcon />
          </button>
        </div>
        <span>StudyLens has three new looks: Sunrise, Ocean and Pastel.</span>
        <div>
          <button
            type="button"
            className="sl-btn-primary"
            onClick={() => {
              dismiss();
              openTab('/options.html#settings');
            }}
          >
            Choose a theme
          </button>
        </div>
      </div>
    );
  }

  if (state.welcome === 'pending') {
    return (
      <p className="sl-hint" style={{ margin: 0 }}>
        <SparkleIcon />
        <span>
          New here?{' '}
          <button type="button" className="sl-link" onClick={() => openTab('/welcome.html')}>
            Finish setting up StudyLens
          </button>
        </span>
      </p>
    );
  }

  return null;
}
