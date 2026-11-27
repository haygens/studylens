import type { Metadata } from 'next';
import { DEFAULT_LOOK, LOOK_IDS, LOOK_STORAGE_KEY, lookCss } from '@studylens/shared/room-looks';
import RoomShell from './RoomShell';

/**
 * /s/<code> (P18c): the read-only live room of a StudyLens group session — shared timer, group
 * name, optional goal, participants' names and statuses. Works on any phone, no extension needed.
 * Never indexed (meta robots here, plus X-Robots-Tag and Referrer-Policy: no-referrer from
 * next.config.ts, so the code doesn't leak through links).
 *
 * P21: shown in one of three cozy looks (RoomShell.tsx). The look tokens are CSS variables on
 * <html data-look="…">; the tiny boot script below sets that attribute before the page paints
 * (stored choice, then #look= / ?look=, then the café), so a dark look never flashes light.
 */
export const metadata: Metadata = {
  title: 'Live room',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const TOKENS_CSS = lookCss((id) => `html[data-look="${id}"]`, undefined, 'html:not([data-look])');

/** Same rule as pickLook() in packages/shared/src/room-looks.ts, without imports. */
const BOOT_SCRIPT = `(function(){var ok=${JSON.stringify(LOOK_IDS)},s=null;try{s=localStorage.getItem(${JSON.stringify(LOOK_STORAGE_KEY)})}catch(e){}function f(p){var m=/(?:^|[?#&])look=([a-z]+)(?:&|$)/.exec(p);return m&&ok.indexOf(m[1])>=0?m[1]:null}document.documentElement.setAttribute('data-look',ok.indexOf(s)>=0?s:f(location.hash)||f(location.search)||${JSON.stringify(DEFAULT_LOOK)})})();`;

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TOKENS_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      <RoomShell code={code} />
    </>
  );
}
