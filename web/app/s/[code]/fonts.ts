/**
 * P21: the room looks' fonts, self-hosted by next/font (downloaded at build time and served from
 * this site; the browser never contacts Google). Not preloaded: a browser downloads only the
 * fonts the chosen look actually uses.
 */
import { DM_Sans, DM_Serif_Display, Fraunces, Inter, Lora } from 'next/font/google';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', preload: false });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', preload: false });
const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dm-serif',
  preload: false,
});
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', preload: false });
const lora = Lora({ subsets: ['latin'], variable: '--font-lora', preload: false });

/** Class names that define the --font-* variables (put on the room's root element). */
export const LOOK_FONT_CLASSES = [fraunces, inter, dmSerif, dmSans, lora]
  .map((f) => f.variable)
  .join(' ');
