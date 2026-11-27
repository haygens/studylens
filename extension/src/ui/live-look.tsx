/**
 * Room looks in the extension (P21): the live session card (popup and Study groups tab) takes the
 * look that matches the user's theme (Sunrise → Hearth, Ocean → Rainy Window, Pastel → Corner
 * Café), with a compact scene strip on top. Local and visual only: nothing is sent anywhere.
 *
 * Colours come from the look tokens (`--lk-*`, added by page.tsx from packages/shared); inside a
 * `.sl-look` card the theme tokens point at them (styles.css), so the card's buttons, chips and
 * ring follow the look. Fonts: system serif/sans stacks only (no web fonts in the extension).
 * The strip is decorative (aria-hidden) and stands still under prefers-reduced-motion.
 */
import type { ReactNode } from 'react';
import { DEFAULT_THEME } from './themes';
import { ROOM_LOOKS, lookForTheme, type LookId } from '@studylens/shared/room-looks';
import { useTheme } from './use-theme';

/** The look for the user's theme (the default theme's look while the theme loads). */
export function useLook(): LookId {
  const { theme } = useTheme();
  return lookForTheme(theme ?? DEFAULT_THEME);
}

function HearthStrip() {
  return (
    <svg viewBox="0 0 320 64" preserveAspectRatio="xMidYMax slice" focusable="false">
      <rect className="lk-s1" width="320" height="64" />
      <path className="lk-s2" d="M120 64 V36 A40 30 0 0 1 200 36 V64 Z" />
      <g className="lk-flames-a">
        <path
          className="lk-s3"
          d="M160 60 C146 52 148 38 156 28 C158 36 162 36 163 30 C172 40 174 54 160 60 Z"
        />
      </g>
      <g className="lk-flames-b">
        <path
          className="lk-s4"
          d="M160 60 C152 55 152 46 157 40 C159 45 162 45 163 42 C168 48 168 56 160 60 Z"
        />
      </g>
      <rect className="lk-s6" x="136" y="58" width="48" height="6" rx="3" />
    </svg>
  );
}

function CafeStrip() {
  const mug = (x: number, cls: string, steam: boolean) => (
    <g key={x}>
      {steam && (
        <path className="lk-steam" d={`M${x + 10} 30 c-4 -5 4 -8 0 -13 c-4 -5 4 -8 0 -13`} />
      )}
      <rect className={cls} x={x} y={34} width={22} height={20} rx={4} />
    </g>
  );
  return (
    <svg viewBox="0 0 320 64" preserveAspectRatio="xMidYMax meet" focusable="false">
      {mug(118, 'lk-s3', true)}
      {mug(150, 'lk-s4', false)}
      {mug(182, 'lk-s5', true)}
      <rect className="lk-s1" x="90" y="54" width="140" height="7" rx="3" />
    </svg>
  );
}

function RainyStrip() {
  const streaks = (offset: number) =>
    Array.from({ length: 8 }, (_, i) => {
      const x = 14 + i * 40 + offset;
      const y = ((i * 23 + offset) % 40) + 2;
      return <line key={i} x1={x} y1={y} x2={x - 3} y2={y + 10} />;
    });
  return (
    <svg viewBox="0 0 320 64" preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect className="lk-s1" width="320" height="64" />
      <circle className="lk-s2" cx="250" cy="20" r="10" />
      <path className="lk-s4" d="M0 50 C70 38 140 44 200 50 C250 55 290 42 320 46 V64 H0 Z" />
      <g className="lk-rain lk-rain-1">{streaks(0)}</g>
      <g className="lk-rain lk-rain-2">{streaks(13)}</g>
      <g className="lk-rain lk-rain-3">{streaks(26)}</g>
      <rect className="lk-s6" x="157" y="0" width="6" height="64" />
    </svg>
  );
}

const STRIPS: Record<LookId, () => ReactNode> = {
  hearth: HearthStrip,
  cafe: CafeStrip,
  rainy: RainyStrip,
};

/** The ~64px scene at the top of a live session card. Decorative. */
export function LookStrip({ look }: { look: LookId }) {
  const Strip = STRIPS[look];
  return (
    <div className="sl-look-strip" aria-hidden="true">
      <Strip />
    </div>
  );
}

/** The look's live pill ("Live by the fire"), with a softly pulsing dot. */
export function LookPill({ look }: { look: LookId }) {
  return (
    <span className="sl-look-pill">
      <span className="slm-live-dot" aria-hidden="true">
        ●
      </span>
      {ROOM_LOOKS[look].pill}
    </span>
  );
}
