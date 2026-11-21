/** Popup footer (P13b): My Data link and the privacy promise. */
import { browser } from 'wxt/browser';
import { ShieldIcon } from '@/src/ui/icons';

function openMyData() {
  void browser.tabs
    .create({ url: `${browser.runtime.getURL('/options.html')}#my-data` })
    .then(() => window.close());
}

export default function PopupFooter() {
  return (
    <footer className="sl-pop-foot">
      <button type="button" className="sl-link sl-row" onClick={openMyData}>
        <ShieldIcon />
        My Data
      </button>
      <span className="sl-muted">Your data stays on this device</span>
    </footer>
  );
}
