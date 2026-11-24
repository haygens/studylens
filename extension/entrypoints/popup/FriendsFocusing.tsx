/**
 * Passive study groups (P18): "2 friends focusing now" in the popup, linking to Study groups.
 * Shown only when relevant: nothing (and no request at all) for solo users or without groups;
 * nothing when nobody is focusing, StudyLens may not contact its server, or it can't be reached.
 * The request sends only this browser's token — nothing about me.
 */
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { friendsFocusingText } from '@/src/groups/activity-view';
import { groupDeps } from '@/src/groups/browser-groups';
import { focusingFriends } from '@/src/groups/service';

export default function FriendsFocusing() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void focusingFriends(groupDeps).then(setCount, () => setCount(null));
  }, []);
  const text = friendsFocusingText(count);
  if (!text) return null;
  return (
    <p className="sl-row" style={{ margin: '8px 0 0', gap: 6 }} role="status">
      <span className="sl-chip sl-chip-study">● {text}</span>
      <button
        type="button"
        className="sl-link"
        onClick={() =>
          void browser.tabs
            .create({ url: `${browser.runtime.getURL('/options.html')}#groups` })
            .then(() => window.close())
        }
      >
        Study groups
      </button>
    </p>
  );
}
