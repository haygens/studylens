import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_TEXT, contrastRatio } from './contrast';
import {
  DEFAULT_LOOK,
  LOOK_CONTRAST_PAIRS,
  LOOK_IDS,
  ROOM_LOOKS,
  THEME_LOOK,
  isAway,
  isLookId,
  lookCss,
  lookForTheme,
  lookFromUrlPart,
  lookStatusText,
  lookVarName,
  pickLook,
  type LookTokens,
} from './room-looks';
import { THEME_IDS } from './themes';

describe('theme → look', () => {
  it('Sunrise → Hearth, Ocean → Rainy Window, Pastel → Corner Café; unknown → café', () => {
    expect(THEME_LOOK).toEqual({ sunrise: 'hearth', ocean: 'rainy', pastel: 'cafe' });
    for (const id of THEME_IDS) expect(isLookId(lookForTheme(id))).toBe(true);
    expect(lookForTheme('dark')).toBe('cafe');
    expect(lookForTheme(undefined)).toBe('cafe');
    expect(DEFAULT_LOOK).toBe('cafe');
  });

  it('reads look= from a hash or query, ignoring unknown values', () => {
    expect(lookFromUrlPart('#look=rainy')).toBe('rainy');
    expect(lookFromUrlPart('?look=hearth&x=1')).toBe('hearth');
    expect(lookFromUrlPart('?look=disco')).toBeNull();
    expect(lookFromUrlPart('')).toBeNull();
    expect(lookFromUrlPart('#look=__proto__')).toBeNull();
  });

  it('stored override > hash > query > café', () => {
    expect(pickLook('rainy', '#look=hearth', '?look=cafe')).toBe('rainy');
    expect(pickLook(null, '#look=hearth', '?look=rainy')).toBe('hearth');
    expect(pickLook('bogus', '', '?look=rainy')).toBe('rainy');
    expect(pickLook(undefined, '#look=nope', '?look=nope')).toBe('cafe');
  });
});

describe('status words (never colour alone)', () => {
  const p = (
    status: 'focusing' | 'finished' | 'left',
    recentlySeen = true,
    mins: number | null = null,
  ) => ({
    status,
    recentlySeen,
    lastSeenMinutesAgo: mins,
  });
  it('focusing, finished, left are the same in every look', () => {
    for (const look of LOOK_IDS) {
      expect(lookStatusText(look, p('focusing'))).toBe('Focusing');
      expect(lookStatusText(look, p('finished'))).toBe('Finished');
      expect(lookStatusText(look, p('left'))).toBe('Left early');
    }
  });
  it('away after 2 minutes without a heartbeat, in each look’s words', () => {
    const away = p('focusing', false, 3);
    expect(isAway(away)).toBe(true);
    expect(isAway(p('left', false, 3))).toBe(false);
    expect(lookStatusText('hearth', away)).toBe('Away (last seen 3 min ago)');
    expect(lookStatusText('cafe', away)).toBe('Stepped away · 3 min');
    expect(lookStatusText('rainy', away)).toBe('Lamp off · 3 min');
    expect(lookStatusText('cafe', p('focusing', false, null))).toBe('Stepped away · 2 min');
  });
  it('the copy the spec asks for', () => {
    expect(ROOM_LOOKS.hearth.pill).toBe('Live by the fire');
    expect(ROOM_LOOKS.cafe.pill).toBe('Café open · live');
    expect(ROOM_LOOKS.rainy.pill).toBe('Live · quiet hours');
    expect(ROOM_LOOKS.hearth.listTitle).toBe('Around the fire');
    expect(ROOM_LOOKS.cafe.listTitle).toBe('At the table');
    expect(ROOM_LOOKS.rainy.listTitle).toBe('Lamps on');
  });
});

describe('look tokens', () => {
  const names = Object.keys(ROOM_LOOKS.cafe.tokens).sort();
  it('every look defines the same tokens, all #rrggbb', () => {
    for (const id of LOOK_IDS) {
      expect(Object.keys(ROOM_LOOKS[id].tokens).sort()).toEqual(names);
      for (const v of Object.values(ROOM_LOOKS[id].tokens)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('uses the spec’s anchor colours', () => {
    expect(ROOM_LOOKS.hearth.tokens.bg).toBe('#1b1311');
    expect(ROOM_LOOKS.cafe.tokens.bg).toBe('#f3e7d8');
    expect(ROOM_LOOKS.cafe.tokens.boardBg).toBe('#2f3a33');
    expect(ROOM_LOOKS.cafe.tokens.boardFrame).toBe('#6b4a32');
    expect(ROOM_LOOKS.cafe.tokens.focusing).toBe('#2f6b3f');
    expect(ROOM_LOOKS.rainy.tokens.bg).toBe('#121a2c');
    expect(ROOM_LOOKS.rainy.tokens.boardFrame).toBe('#2c3757');
    expect(ROOM_LOOKS.rainy.tokens.timer).toBe('#ffe4b8');
  });

  it('CSS: one rule per look (plus the fallback), no web fonts or URLs', () => {
    const css = lookCss((id) => `[data-look="${id}"]`, undefined, '.root');
    for (const id of LOOK_IDS) expect(css).toContain(`[data-look="${id}"]{`);
    expect(css.startsWith(`.root{${lookVarName('bg')}:${ROOM_LOOKS.cafe.tokens.bg};`)).toBe(true);
    expect(css).toContain('--lk-board-muted:');
    expect(css).toContain('--lk-display:');
    expect(css).not.toMatch(/url\(|@import|@font-face|https?:/i);
  });
});

describe.each(LOOK_IDS)('%s meets WCAG AA', (id) => {
  const t = ROOM_LOOKS[id].tokens;
  it.each(LOOK_CONTRAST_PAIRS.map((p) => [`${p.fg} on ${p.bg} (${p.where})`, p] as const))(
    '%s',
    (_name, pair) => {
      const min = pair.kind === 'text' ? AA_TEXT : AA_NON_TEXT;
      expect(
        contrastRatio(t[pair.fg as keyof LookTokens], t[pair.bg as keyof LookTokens]),
      ).toBeGreaterThanOrEqual(min);
    },
  );
});

describe('motion.css', () => {
  const css = readFileSync(new URL('../styles/motion.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  it('animates only under prefers-reduced-motion: no-preference', () => {
    const outside = css.slice(0, css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(outside).not.toMatch(/animation|transition|@keyframes/);
    expect(css).toContain('--dur-fast: 150ms');
    expect(css).toContain('--dur-med: 250ms');
    expect(css).toContain('--ease-out: cubic-bezier(0.2, 0.7, 0.2, 1)');
  });
  it('animates only transform and opacity, and has no colours', () => {
    const keyframes = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})+\s*\}/g) ?? [];
    expect(keyframes.length).toBe(4);
    for (const block of keyframes) {
      const props = [...block.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(props.every((p) => p === 'opacity' || p === 'transform')).toBe(true);
    }
    const transitions = [...css.matchAll(/transition:\s*([a-z-]+)/g)].map((m) => m[1]);
    expect(transitions).toEqual(['transform']);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
