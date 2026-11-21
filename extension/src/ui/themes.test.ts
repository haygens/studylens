import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastRatio, luminance } from './contrast';
import { CONTRAST_PAIRS } from './theme-pairs';
import {
  DEFAULT_THEME,
  THEMES,
  THEME_IDS,
  cssVarName,
  isThemeId,
  themeCss,
  type ThemeTokens,
} from './themes';

const COLOR_TOKENS = (Object.keys(THEMES.sunrise.tokens) as (keyof ThemeTokens)[]).filter((k) =>
  /^#[0-9a-f]{6}$/i.test(THEMES.sunrise.tokens[k]),
);

describe('contrast', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#ffffff', '#767676')).toBeCloseTo(4.54, 2); // order doesn't matter
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('rejects colors it cannot measure', () => {
    expect(() => luminance('red')).toThrow();
    expect(() => luminance('#fff')).toThrow();
  });
});

describe('themes', () => {
  it('has three themes, Sunrise by default', () => {
    expect(THEME_IDS).toEqual(['sunrise', 'ocean', 'pastel']);
    expect(DEFAULT_THEME).toBe('sunrise');
    for (const id of THEME_IDS) expect(THEMES[id].id).toBe(id);
  });

  it('recognizes only real theme ids', () => {
    expect(isThemeId('ocean')).toBe(true);
    expect(isThemeId('dark')).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(3)).toBe(false);
  });

  it('every theme defines the same tokens, and colors are #rrggbb in every theme', () => {
    const names = Object.keys(THEMES.sunrise.tokens).sort();
    for (const id of THEME_IDS) {
      expect(Object.keys(THEMES[id].tokens).sort()).toEqual(names);
      for (const k of COLOR_TOKENS) expect(THEMES[id].tokens[k]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(COLOR_TOKENS.length).toBeGreaterThan(40);
  });

  it('uses no web fonts or remote resources', () => {
    const css = themeCss();
    expect(css).not.toMatch(/url\(|@import|@font-face|https?:/i);
  });

  it('keeps text at 13px or more and body text at 14px or more', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id].tokens;
      expect(parseFloat(t.fsSmall)).toBeGreaterThanOrEqual(13);
      expect(parseFloat(t.fsBody)).toBeGreaterThanOrEqual(14);
    }
  });

  it('turns token names into CSS variables', () => {
    expect(cssVarName('fsSmall')).toBe('--sl-fs-small');
    expect(cssVarName('bg2')).toBe('--sl-bg-2');
    const css = themeCss();
    for (const id of THEME_IDS) expect(css).toContain(`[data-theme="${id}"]{`);
    expect(css).toContain(':root:not([data-theme]){');
    expect(css).toContain(`--sl-ink:${THEMES.sunrise.tokens.ink};`);
  });

  it('only checks pairs of color tokens', () => {
    for (const p of CONTRAST_PAIRS) {
      expect(COLOR_TOKENS).toContain(p.fg);
      expect(COLOR_TOKENS).toContain(p.bg);
    }
  });

  describe.each(THEME_IDS)('%s passes WCAG AA', (id) => {
    const t = THEMES[id].tokens;
    it.each(CONTRAST_PAIRS.map((p) => [`${p.fg} on ${p.bg} (${p.where})`, p] as const))(
      '%s',
      (_name, p) => {
        const ratio = contrastRatio(t[p.fg], t[p.bg]);
        expect(
          ratio,
          `${id}: ${p.fg} ${t[p.fg]} on ${p.bg} ${t[p.bg]} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(p.min);
      },
    );
  });

  it('gives Study, Neutral and Distraction clearly different colors in every theme', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id].tokens;
      const colors = new Set([t.study, t.neutral, t.distraction]);
      expect(colors.size).toBe(3);
      // Category text is real text everywhere it appears.
      for (const c of [t.study, t.neutral, t.distraction]) {
        expect(contrastRatio(c, t.surface)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });
});
