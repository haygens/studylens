/**
 * Room looks (P21): three cozy looks for live group sessions — Hearth, Corner Café and Rainy
 * Window. The look follows the user's colour theme (Sunrise → Hearth, Ocean → Rainy, Pastel →
 * Café); the web room page can override it with a small switcher (stored in that browser only).
 *
 * The look is a purely local, visual choice: it is never sent to the server and never logged.
 * The extension passes it to the room page in the URL fragment (`#look=hearth`), which browsers
 * never send to the server; the page also accepts `?look=` and reads it in the browser only.
 *
 * Like the themes, every colour is a token (6-digit hex, so the tests can measure contrast) and
 * the tokens become CSS custom properties (`--lk-<token>`). LOOK_CONTRAST_PAIRS lists every
 * text/background pair the looks use; room-looks.test.ts checks them all for WCAG AA.
 */
import { LIVE_HEARTBEAT_STALE_MS, focusingStatusText, type RoomParticipant } from './live';
import type { ThemeId } from './themes';

export const LOOK_IDS = ['hearth', 'cafe', 'rainy'] as const;
export type LookId = (typeof LOOK_IDS)[number];
/** Visitors without the extension (no look in the link, nothing stored) get the café. */
export const DEFAULT_LOOK: LookId = 'cafe';
/** localStorage key of the room page's look override (that browser only). */
export const LOOK_STORAGE_KEY = 'studylens.roomLook';

export const THEME_LOOK: Record<ThemeId, LookId> = {
  sunrise: 'hearth',
  ocean: 'rainy',
  pastel: 'cafe',
};

export function isLookId(value: unknown): value is LookId {
  return typeof value === 'string' && (LOOK_IDS as readonly string[]).includes(value);
}

/** The look for a theme; the café when the theme is unknown. */
export function lookForTheme(theme: unknown): LookId {
  return typeof theme === 'string' && theme in THEME_LOOK
    ? THEME_LOOK[theme as ThemeId]
    : DEFAULT_LOOK;
}

/** `look=<id>` from a URL hash (`#look=rainy`) or query (`?look=rainy`); null if absent/unknown. */
export function lookFromUrlPart(part: string): LookId | null {
  const value = new URLSearchParams(part.replace(/^[#?]/, '')).get('look');
  return isLookId(value) ? value : null;
}

/**
 * Which look the room page shows: the stored override first, then the link (hash, then query),
 * then the café. Unknown values are ignored.
 */
export function pickLook(stored: unknown, hash: string, search: string): LookId {
  if (isLookId(stored)) return stored;
  return lookFromUrlPart(hash) ?? lookFromUrlPart(search) ?? DEFAULT_LOOK;
}

/** Colours are 6-digit hex. Scene colours (`scene*`) are decorative (no contrast requirement). */
export interface LookTokens {
  /** Page background gradient (top → bottom). */
  bg: string;
  bg2: string;
  /** Cards, and the rows of the member list. */
  surface: string;
  row: string;
  ink: string;
  muted: string;
  /** Links, the selected switcher button, primary buttons (with `onLink` text). */
  link: string;
  onLink: string;
  /** Button hover background (ink text on it). */
  linkSoft: string;
  focus: string;
  /** Button and input borders: 3:1 against the surface. */
  inputBorder: string;
  /** Decorative borders, dividers, the ring's track. */
  border: string;
  hair: string;
  track: string;
  ring: string;
  /** The "Live" pill. */
  pillBg: string;
  pillInk: string;
  /** The card that holds the group name, goal and timer, and its lamp/ember glow (centre). */
  boardBg: string;
  glow: string;
  boardInk: string;
  boardMuted: string;
  boardFrame: string;
  timer: string;
  /** Statuses (always written out in words too). */
  focusing: string;
  focusingSoft: string;
  finished: string;
  away: string;
  error: string;
  /** Status dots: lit (focusing) and the hollow ring (away / left). Non-text, 3:1. */
  dotOn: string;
  dotRing: string;
  // Scene (decorative, aria-hidden)
  scene1: string;
  scene2: string;
  scene3: string;
  scene4: string;
  scene5: string;
  scene6: string;
}

export interface RoomLook {
  id: LookId;
  /** The switcher's button label. */
  name: string;
  /** The live pill and the member list's title. */
  pill: string;
  listTitle: string;
  /** Display (serif) and body fonts without web fonts (the extension; the web adds its own). */
  displayFont: string;
  bodyFont: string;
  tokens: LookTokens;
}

const SYSTEM_SANS = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

export const ROOM_LOOKS: Record<LookId, RoomLook> = {
  hearth: {
    id: 'hearth',
    name: 'Hearth',
    pill: 'Live by the fire',
    listTitle: 'Around the fire',
    displayFont: SYSTEM_SERIF,
    bodyFont: SYSTEM_SANS,
    tokens: {
      bg: '#1b1311',
      bg2: '#140e0c',
      surface: '#2a1c17',
      row: '#33231d',
      ink: '#f6e8d6',
      muted: '#cbb39c',
      link: '#ffbf80',
      onLink: '#1b1311',
      linkSoft: '#3d2a22',
      focus: '#ffbf80',
      inputBorder: '#9a7c68',
      border: '#4a3026',
      hair: '#3a2720',
      track: '#4a3026',
      ring: '#ff9a4d',
      pillBg: '#4a2a19',
      pillInk: '#ffd8a8',
      boardBg: '#2a1c17',
      glow: '#4a2616',
      boardInk: '#f6e8d6',
      boardMuted: '#cbb39c',
      boardFrame: '#4a3026',
      timer: '#fbe3c0',
      focusing: '#ffc46b',
      focusingSoft: '#3f2a18',
      finished: '#ead5b8',
      away: '#cbb39c',
      error: '#ff9d8a',
      dotOn: '#ffb347',
      dotRing: '#a88c78',
      scene1: '#3b2620',
      scene2: '#1f1411',
      scene3: '#ff8a3d',
      scene4: '#ffc15e',
      scene5: '#ff5e2b',
      scene6: '#5a3a2a',
    },
  },
  cafe: {
    id: 'cafe',
    name: 'Corner Café',
    pill: 'Café open · live',
    listTitle: 'At the table',
    displayFont: SYSTEM_SERIF,
    bodyFont: SYSTEM_SANS,
    tokens: {
      bg: '#f3e7d8',
      bg2: '#ecdcc8',
      surface: '#fbf5ec',
      row: '#f3e7d8',
      ink: '#3a2a1f',
      muted: '#674e3e',
      link: '#8a3f1d',
      onLink: '#ffffff',
      linkSoft: '#f0dfcb',
      focus: '#8a3f1d',
      inputBorder: '#8a6a58',
      border: '#e2cfb8',
      hair: '#e2cfb8',
      track: '#e8d8c4',
      ring: '#2f6b3f',
      pillBg: '#2f6b3f',
      pillInk: '#ffffff',
      boardBg: '#2f3a33',
      glow: '#2f3a33',
      boardInk: '#f4f1e8',
      boardMuted: '#c9d3c8',
      boardFrame: '#6b4a32',
      timer: '#f7f3ea',
      focusing: '#2f6b3f',
      focusingSoft: '#e1efe0',
      finished: '#6b4a32',
      away: '#674e3e',
      error: '#a3241c',
      dotOn: '#2f6b3f',
      dotRing: '#8a6a58',
      scene1: '#a87b56',
      scene2: '#7a5538',
      scene3: '#fffaf2',
      scene4: '#c96f4a',
      scene5: '#7f9c8a',
      scene6: '#a8937c',
    },
  },
  rainy: {
    id: 'rainy',
    name: 'Rainy Window',
    pill: 'Live · quiet hours',
    listTitle: 'Lamps on',
    displayFont: SYSTEM_SERIF,
    bodyFont: SYSTEM_SANS,
    tokens: {
      bg: '#121a2c',
      bg2: '#0d1322',
      surface: '#1a2440',
      row: '#222d4d',
      ink: '#e7ebf5',
      muted: '#adb7cf',
      link: '#ffd08a',
      onLink: '#121a2c',
      linkSoft: '#2a3658',
      focus: '#ffd08a',
      inputBorder: '#7d89a8',
      border: '#2c3757',
      hair: '#26304e',
      track: '#2c3757',
      ring: '#ffc46b',
      pillBg: '#2c3757',
      pillInk: '#ffe4b8',
      boardBg: '#1a2440',
      glow: '#3a3550',
      boardInk: '#e7ebf5',
      boardMuted: '#b6bfd4',
      boardFrame: '#2c3757',
      timer: '#ffe4b8',
      focusing: '#ffcf7a',
      focusingSoft: '#33324a',
      finished: '#c9d4ee',
      away: '#adb7cf',
      error: '#ffa69a',
      dotOn: '#ffc46b',
      dotRing: '#8d99b8',
      scene1: '#1d2a4a',
      scene2: '#f3ecd2',
      scene3: '#16213a',
      scene4: '#24345a',
      scene5: '#8fa3cf',
      scene6: '#2c3757',
    },
  },
};

type StatusFields = Pick<RoomParticipant, 'status' | 'recentlySeen' | 'lastSeenMinutesAgo'>;

/** True when the participant counts as "away": focusing, but no heartbeat for 2+ minutes. */
export function isAway(p: StatusFields): boolean {
  return p.status === 'focusing' && !p.recentlySeen;
}

/**
 * A participant's status in the look's words (never by colour alone). Away keeps the minutes:
 * "Stepped away · 3 min" (café), "Lamp off · 3 min" (rainy), "Away (last seen 3 min ago)".
 */
export function lookStatusText(look: LookId, p: StatusFields): string {
  if (p.status === 'finished') return 'Finished';
  if (p.status === 'left') return 'Left early';
  if (!isAway(p) || look === 'hearth') return focusingStatusText(p);
  const minutes = Math.max(LIVE_HEARTBEAT_STALE_MS / 60_000, p.lastSeenMinutesAgo ?? 0);
  return look === 'cafe' ? `Stepped away · ${minutes} min` : `Lamp off · ${minutes} min`;
}

/** `boardMuted` → `--lk-board-muted`. */
export function lookVarName(token: keyof LookTokens | 'display' | 'body'): string {
  return `--lk-${token.replace(/[A-Z0-9]+/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** Font stacks per look (the web passes its self-hosted fonts first). */
export type LookFonts = Record<LookId, { display: string; body: string }>;

export const SYSTEM_LOOK_FONTS: LookFonts = {
  hearth: { display: ROOM_LOOKS.hearth.displayFont, body: ROOM_LOOKS.hearth.bodyFont },
  cafe: { display: ROOM_LOOKS.cafe.displayFont, body: ROOM_LOOKS.cafe.bodyFont },
  rainy: { display: ROOM_LOOKS.rainy.displayFont, body: ROOM_LOOKS.rainy.bodyFont },
};

function lookDeclarations(id: LookId, fonts: LookFonts): string {
  const t = ROOM_LOOKS[id].tokens;
  const colours = (Object.keys(t) as (keyof LookTokens)[])
    .map((k) => `${lookVarName(k)}:${t[k]};`)
    .join('');
  return `${colours}${lookVarName('display')}:${fonts[id].display};${lookVarName('body')}:${fonts[id].body};`;
}

/**
 * The CSS defining every look's tokens, one rule per look: `<selector(id)>{--lk-…}`. The
 * default look also applies to `fallback` (an element without a look yet), if given.
 */
export function lookCss(
  selector: (id: LookId) => string,
  fonts: LookFonts = SYSTEM_LOOK_FONTS,
  fallback?: string,
): string {
  const rules = LOOK_IDS.map((id) => `${selector(id)}{${lookDeclarations(id, fonts)}}`);
  if (fallback) rules.unshift(`${fallback}{${lookDeclarations(DEFAULT_LOOK, fonts)}}`);
  return rules.join('');
}

type LookColour = keyof LookTokens;

export interface LookContrastPair {
  fg: LookColour;
  bg: LookColour;
  /** 'text' = 4.5:1, 'non-text' = 3:1 (WCAG 1.4.3 / 1.4.11). */
  kind: 'text' | 'non-text';
  where: string;
}

const cardBackgrounds: LookColour[] = ['surface', 'row', 'bg', 'bg2'];
const cardText: LookColour[] = ['ink', 'muted', 'link', 'focusing', 'finished', 'away', 'error'];

/** Every pair the room page and the extension's live card use (see room-looks.test.ts). */
export const LOOK_CONTRAST_PAIRS: readonly LookContrastPair[] = [
  // Text on cards, list rows and the page (the footer and privacy note sit on the page)
  ...cardText.flatMap((fg) =>
    cardBackgrounds.map((bg): LookContrastPair => ({ fg, bg, kind: 'text', where: 'text' })),
  ),
  { fg: 'pillInk', bg: 'pillBg', kind: 'text', where: 'live pill' },
  { fg: 'focusing', bg: 'focusingSoft', kind: 'text', where: '"You’re in this session" chip' },
  { fg: 'ink', bg: 'focusingSoft', kind: 'text', where: 'chip area' },
  { fg: 'onLink', bg: 'link', kind: 'text', where: 'primary / selected button' },
  { fg: 'ink', bg: 'linkSoft', kind: 'text', where: 'button hover' },
  { fg: 'muted', bg: 'linkSoft', kind: 'text', where: 'quiet button hover' },
  // The board (group name, goal, timer), over its plain colour and the glow's centre
  ...(['boardInk', 'boardMuted', 'timer'] as LookColour[]).flatMap((fg) =>
    (['boardBg', 'glow'] as LookColour[]).map((bg): LookContrastPair => ({
      fg,
      bg,
      kind: 'text',
      where: 'board',
    })),
  ),
  { fg: 'pillInk', bg: 'boardBg', kind: 'text', where: 'pill edge on the board' },
  // Controls and indicators
  ...(['bg', 'bg2', 'surface', 'row'] as LookColour[]).map((bg): LookContrastPair => ({
    fg: 'focus',
    bg,
    kind: 'non-text',
    where: 'focus ring',
  })),
  { fg: 'inputBorder', bg: 'surface', kind: 'non-text', where: 'button / input border' },
  { fg: 'inputBorder', bg: 'bg', kind: 'non-text', where: 'switcher button border' },
  { fg: 'link', bg: 'bg', kind: 'non-text', where: 'selected switcher button' },
  { fg: 'link', bg: 'surface', kind: 'non-text', where: 'primary button edge' },
  { fg: 'dotOn', bg: 'row', kind: 'non-text', where: 'lit status dot' },
  { fg: 'dotOn', bg: 'surface', kind: 'non-text', where: 'lit status dot' },
  { fg: 'dotRing', bg: 'row', kind: 'non-text', where: 'hollow status dot' },
  { fg: 'dotRing', bg: 'surface', kind: 'non-text', where: 'hollow status dot' },
  { fg: 'ring', bg: 'surface', kind: 'non-text', where: 'timer ring' },
];
