/**
 * Themes (P13b): three user-selectable looks, Sunrise (default), Ocean and Pastel, from
 * docs/ux-review/REVIEW.md. Each theme is a flat set of design tokens. The tokens become CSS
 * custom properties (`--sl-<token>`) on any element with `data-theme="<id>"` (normally <html>),
 * so a preview card can show another theme just by setting the attribute on itself.
 *
 * Every visual difference between themes is a token, never a theme-specific CSS rule, so the
 * unit tests (themes.test.ts) can check every text/background pair for WCAG AA contrast.
 * Fonts are local system fonts only: no web fonts are ever loaded.
 */

export const THEME_IDS = ['sunrise', 'ocean', 'pastel'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'sunrise';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** Colors are 6-digit hex (so tests can measure contrast). Other tokens are plain CSS values. */
export interface ThemeTokens {
  // Type, shape and depth
  font: string;
  fsSmall: string;
  fsBody: string;
  fsH3: string;
  fsH2: string;
  fsH1: string;
  fsTimer: string;
  radius: string;
  radiusSm: string;
  borderW: string;
  shadow: string;
  cardShadow: string;
  btnShadow: string;
  logoTilt: string;
  // Text and surfaces
  ink: string;
  muted: string;
  surface: string;
  /** Page background gradient stops (top → middle → bottom). */
  bg: string;
  bgMid: string;
  bg2: string;
  /** Top of the popup's background gradient (it fades to `surface`). */
  popTop: string;
  /** Popup header band (gradient stops) and its text. */
  headerBg: string;
  headerBg2: string;
  headerInk: string;
  /** Helper (friction/intention) page background stops. */
  helperBg: string;
  helperBg2: string;
  /** Decorative borders and dividers (no contrast requirement). */
  border: string;
  hair: string;
  /** Empty part of bars and rings. */
  track: string;
  /** Input, select and secondary-button borders: 3:1 against the surface. */
  inputBorder: string;
  focus: string;
  // Brand
  primary: string;
  onPrimary: string;
  primarySoft: string;
  accentText: string;
  // Categories: text color, chip background, bar fill (Distraction bars are also striped)
  study: string;
  studySoft: string;
  studyFill: string;
  neutral: string;
  neutralSoft: string;
  neutralFill: string;
  distraction: string;
  distractionSoft: string;
  distractionFill: string;
  stripe: string;
  // Research conditions
  control: string;
  controlSoft: string;
  friction: string;
  frictionSoft: string;
  intention: string;
  intentionSoft: string;
  // States
  warn: string;
  warnSoft: string;
  warnBorder: string;
  celebrate: string;
  celebrateBg: string;
  celebrateBg2: string;
  confetti1: string;
  confetti2: string;
  confetti3: string;
  /** Timer ring (decorative: the time is written inside it). */
  ring: string;
  frictionRing: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  /** One short line for the theme picker. */
  tagline: string;
  tokens: ThemeTokens;
}

const SYSTEM_FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const THEMES: Record<ThemeId, Theme> = {
  sunrise: {
    id: 'sunrise',
    name: 'Sunrise',
    tagline: 'Warm and upbeat, like a fresh start to the day.',
    tokens: {
      font: SYSTEM_FONT,
      fsSmall: '13px',
      fsBody: '14px',
      fsH3: '16px',
      fsH2: '20px',
      fsH1: '26px',
      fsTimer: '40px',
      radius: '16px',
      radiusSm: '12px',
      borderW: '1px',
      shadow: '0 10px 30px rgba(193, 90, 40, 0.16)',
      cardShadow: '0 1px 2px rgba(30, 27, 58, 0.06)',
      btnShadow: '0 4px 12px rgba(47, 91, 211, 0.3)',
      logoTilt: '0deg',
      ink: '#1e1b3a',
      muted: '#5b5675',
      surface: '#ffffff',
      bg: '#fff7ed',
      bgMid: '#fdf2f8',
      bg2: '#eef2ff',
      popTop: '#fff3e4',
      headerBg: '#fff3e4',
      headerBg2: '#fff3e4',
      headerInk: '#1e1b3a',
      helperBg: '#fff7ed',
      helperBg2: '#fde2ea',
      border: '#f1dcc8',
      hair: '#f3e7dc',
      track: '#f3e6da',
      inputBorder: '#8c7c6f',
      focus: '#2f5bd3',
      primary: '#2f5bd3',
      onPrimary: '#ffffff',
      primarySoft: '#eaf0ff',
      accentText: '#c2410c',
      study: '#0e7a55',
      studySoft: '#e3f7ee',
      studyFill: '#0e7a55',
      neutral: '#5f6378',
      neutralSoft: '#eef0f5',
      neutralFill: '#7f8399',
      distraction: '#c0264b',
      distractionSoft: '#fde8ee',
      distractionFill: '#c0264b',
      stripe: '#f3a3b5',
      control: '#4b5563',
      controlSoft: '#eef0f5',
      friction: '#a14a06',
      frictionSoft: '#fff1dc',
      intention: '#6d3fd1',
      intentionSoft: '#f1ebff',
      warn: '#8a4b00',
      warnSoft: '#fff1d6',
      warnBorder: '#a86a12',
      celebrate: '#b4390a',
      celebrateBg: '#fff1dc',
      celebrateBg2: '#fde8ee',
      confetti1: '#ffc145',
      confetti2: '#e0582e',
      confetti3: '#2f5bd3',
      ring: '#2f5bd3',
      frictionRing: '#f59e0b',
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    tagline: 'Calm and cool, for long deep-focus sessions.',
    tokens: {
      font: `"Segoe UI Variable Text", ${SYSTEM_FONT}`,
      fsSmall: '13px',
      fsBody: '14px',
      fsH3: '15px',
      fsH2: '18px',
      fsH1: '24px',
      fsTimer: '38px',
      radius: '12px',
      radiusSm: '8px',
      borderW: '1px',
      shadow: '0 12px 32px rgba(15, 27, 61, 0.14)',
      cardShadow: 'none',
      btnShadow: '0 2px 6px rgba(15, 27, 61, 0.2)',
      logoTilt: '0deg',
      ink: '#0f1b3d',
      muted: '#4a5878',
      surface: '#ffffff',
      bg: '#f0f7ff',
      bgMid: '#ecf8fb',
      bg2: '#e8faf7',
      popTop: '#f7fbff',
      headerBg: '#0f1b3d',
      headerBg2: '#1f3f8f',
      headerInk: '#ffffff',
      helperBg: '#eaf4ff',
      helperBg2: '#dff6f2',
      border: '#d5e3f2',
      hair: '#e7eef7',
      track: '#e1ebf5',
      inputBorder: '#7b8499',
      focus: '#0f766e',
      primary: '#2f5bd3',
      onPrimary: '#ffffff',
      primarySoft: '#e8efff',
      accentText: '#0f766e',
      study: '#0f766e',
      studySoft: '#dcf7f2',
      studyFill: '#0f766e',
      neutral: '#5a6478',
      neutralSoft: '#eef2f7',
      neutralFill: '#7b8499',
      distraction: '#b9461a',
      distractionSoft: '#fdeee5',
      distractionFill: '#b9461a',
      stripe: '#f2b694',
      control: '#475569',
      controlSoft: '#eef2f7',
      friction: '#9a5b00',
      frictionSoft: '#fff4d6',
      intention: '#5b3fc4',
      intentionSoft: '#eeeaff',
      warn: '#8a5300',
      warnSoft: '#fff4d6',
      warnBorder: '#a3700c',
      celebrate: '#0f766e',
      celebrateBg: '#dcf7f2',
      celebrateBg2: '#e8efff',
      confetti1: '#7dd3c8',
      confetti2: '#2f5bd3',
      confetti3: '#f4b860',
      ring: '#14a094',
      frictionRing: '#f4b860',
    },
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel',
    tagline: 'Playful and cozy, like a sticker-covered notebook.',
    tokens: {
      font: `ui-rounded, "SF Pro Rounded", Nunito, "Segoe UI", ${SYSTEM_FONT}`,
      fsSmall: '13px',
      fsBody: '15px',
      fsH3: '17px',
      fsH2: '20px',
      fsH1: '28px',
      fsTimer: '42px',
      radius: '22px',
      radiusSm: '14px',
      borderW: '2px',
      shadow: '5px 5px 0 #2a2140',
      cardShadow: '0 3px 0 #2a2140',
      btnShadow: '0 3px 0 #2a2140',
      logoTilt: '-6deg',
      ink: '#2a2140',
      muted: '#5f5878',
      surface: '#ffffff',
      bg: '#f6f3ff',
      bgMid: '#f6f3ff',
      bg2: '#effcf6',
      popTop: '#fffbea',
      headerBg: '#fffbea',
      headerBg2: '#fffbea',
      headerInk: '#2a2140',
      helperBg: '#f6f3ff',
      helperBg2: '#fff0f6',
      border: '#2a2140',
      hair: '#ebe5fa',
      track: '#ece6fb',
      inputBorder: '#2a2140',
      focus: '#d6336c',
      primary: '#3557d6',
      onPrimary: '#ffffff',
      primarySoft: '#e9edff',
      accentText: '#b8246b',
      study: '#237a3b',
      studySoft: '#e4f8e9',
      studyFill: '#2b8a3e',
      neutral: '#5e6472',
      neutralSoft: '#f0f1f5',
      neutralFill: '#868e96',
      distraction: '#c0262e',
      distractionSoft: '#ffe8ea',
      distractionFill: '#e03131',
      stripe: '#ffc9c9',
      control: '#55576b',
      controlSoft: '#f0f1f5',
      friction: '#8f5a00',
      frictionSoft: '#fff3c4',
      intention: '#6741d9',
      intentionSoft: '#efe9ff',
      warn: '#8f5a00',
      warnSoft: '#fff3c4',
      warnBorder: '#2a2140',
      celebrate: '#b8246b',
      celebrateBg: '#ffe8f0',
      celebrateBg2: '#fff3c4',
      confetti1: '#ffd43b',
      confetti2: '#d6336c',
      confetti3: '#69db7c',
      ring: '#3557d6',
      frictionRing: '#fcc419',
    },
  },
};

/** `fsSmall` → `--sl-fs-small`. */
export function cssVarName(token: keyof ThemeTokens): string {
  return `--sl-${token.replace(/[A-Z0-9]+/g, (m) => `-${m.toLowerCase()}`)}`;
}

function declarations(tokens: ThemeTokens): string {
  return (Object.keys(tokens) as (keyof ThemeTokens)[])
    .map((k) => `${cssVarName(k)}:${tokens[k]};`)
    .join('');
}

/**
 * The CSS that defines every theme's tokens. Pages without a `data-theme` (e.g. before the
 * stored choice is read) get the default theme.
 */
export function themeCss(): string {
  const fallback = `:root:not([data-theme]){${declarations(THEMES[DEFAULT_THEME].tokens)}}`;
  return (
    fallback +
    THEME_IDS.map((id) => `[data-theme="${id}"]{${declarations(THEMES[id].tokens)}}`).join('')
  );
}

/** One theme's tokens on `:root` (P18c: the web companion uses Sunrise only). */
export function rootThemeCss(id: ThemeId = DEFAULT_THEME): string {
  return `:root{${declarations(THEMES[id].tokens)}}`;
}
