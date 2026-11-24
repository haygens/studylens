/** Popup footer (P13b): My Data, Study groups (P16), "Send feedback" (once FEEDBACK_URL is set). */
import { browser } from 'wxt/browser';
import FeedbackLink from '@/src/ui/FeedbackLink';
import { ShieldIcon } from '@/src/ui/icons';

function openOptions(tab: 'my-data' | 'groups') {
  void browser.tabs
    .create({ url: `${browser.runtime.getURL('/options.html')}#${tab}` })
    .then(() => window.close());
}

export default function PopupFooter() {
  return (
    <footer className="sl-pop-foot">
      <button type="button" className="sl-link sl-row" onClick={() => openOptions('my-data')}>
        <ShieldIcon />
        My Data
      </button>
      <button type="button" className="sl-link" onClick={() => openOptions('groups')}>
        Study groups
      </button>
      <FeedbackLink />
      <span className="sl-muted">Your browsing data stays on this device</span>
    </footer>
  );
}
