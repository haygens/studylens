/**
 * Every foreground/background token pair the UI actually uses, with the contrast it needs
 * (P13b). themes.test.ts checks each pair in each theme, so a new pair in the CSS should be
 * added here too.
 */
import { AA_NON_TEXT, AA_TEXT } from './contrast';
import type { ThemeTokens } from './themes';

type Color = keyof ThemeTokens;

export interface ContrastPair {
  fg: Color;
  bg: Color;
  min: number;
  /** Where the pair appears, for the failure message. */
  where: string;
}

const pageBackgrounds: Color[] = ['surface', 'bg', 'bgMid', 'bg2', 'popTop'];
const bodyText: Color[] = [
  'ink',
  'muted',
  'primary',
  'accentText',
  'study',
  'neutral',
  'distraction',
  'control',
  'friction',
  'intention',
  'warn',
];

const text = (fg: Color, bg: Color, where: string): ContrastPair => ({
  fg,
  bg,
  min: AA_TEXT,
  where,
});
const nonText = (fg: Color, bg: Color, where: string): ContrastPair => ({
  fg,
  bg,
  min: AA_NON_TEXT,
  where,
});

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Text on cards and page backgrounds
  ...bodyText.flatMap((fg) => pageBackgrounds.map((bg) => text(fg, bg, 'text on page/card'))),
  // Popup header band
  text('headerInk', 'headerBg', 'popup header'),
  text('headerInk', 'headerBg2', 'popup header'),
  // Helper (friction/intention) pages: text sits on the card, but check the page too
  text('ink', 'helperBg', 'helper page'),
  text('ink', 'helperBg2', 'helper page'),
  text('muted', 'helperBg', 'helper page'),
  text('muted', 'helperBg2', 'helper page'),
  // Buttons and selected choices
  text('onPrimary', 'primary', 'primary button'),
  text('onPrimary', 'study', 'selected "Yes"'),
  text('onPrimary', 'distraction', 'danger button'),
  text('primary', 'primarySoft', 'session pill / soft primary'),
  text('ink', 'primarySoft', 'soft primary background'),
  // Category chips
  text('study', 'studySoft', 'Study chip'),
  text('neutral', 'neutralSoft', 'Neutral chip'),
  text('distraction', 'distractionSoft', 'Distraction chip'),
  text('ink', 'studySoft', 'Study chip area'),
  // Condition chips
  text('control', 'controlSoft', 'Control chip'),
  text('friction', 'frictionSoft', 'Friction chip'),
  text('intention', 'intentionSoft', 'Intention chip'),
  // Paused / warning banners
  text('warn', 'warnSoft', 'paused banner'),
  text('ink', 'warnSoft', 'paused banner'),
  text('muted', 'warnSoft', 'paused banner'),
  // Session complete
  text('celebrate', 'celebrateBg', 'session complete'),
  text('celebrate', 'celebrateBg2', 'session complete'),
  text('ink', 'celebrateBg', 'session complete'),
  text('ink', 'celebrateBg2', 'session complete'),
  text('muted', 'celebrateBg', 'session complete'),
  text('muted', 'celebrateBg2', 'session complete'),
  // Controls (WCAG 1.4.11): borders, focus ring, bar fills against the surface and the track
  nonText('inputBorder', 'surface', 'input / button border'),
  nonText('inputBorder', 'popTop', 'input / button border'),
  ...pageBackgrounds.map((bg) => nonText('focus', bg, 'focus ring')),
  nonText('focus', 'helperBg', 'focus ring'),
  nonText('focus', 'helperBg2', 'focus ring'),
  nonText('primary', 'surface', 'primary button edge'),
  nonText('studyFill', 'surface', 'Study bar'),
  nonText('neutralFill', 'surface', 'Neutral bar'),
  nonText('distractionFill', 'surface', 'Distraction bar'),
  nonText('studyFill', 'track', 'Study bar on track'),
  nonText('distractionFill', 'track', 'Distraction bar on track'),
  nonText('warnBorder', 'surface', 'paused banner edge'),
];
