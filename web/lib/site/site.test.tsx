/** P18c: the web companion's pages and helpers (rendered to static HTML, no browser needed). */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AA_TEXT, contrastRatio } from '@studylens/shared/contrast';
import { FEEDBACK_URL, GITHUB_URL, INSTALL_LINKS } from '@studylens/shared/links';
import { THEMES } from '@studylens/shared/themes';
import type { LiveRoom } from '@studylens/shared';
import Home from '@/app/page';
import { RoomDetails } from '@/app/s/[code]/RoomView';
import { RoomScenes } from '@/app/s/[code]/scenes';
import { MEDIA, repoPath } from './repo-files';
import { absolutizeLinks, privacyHtml } from './privacy';
import {
  formatClock,
  minutesLeftLabel,
  offsetFrom,
  participantLabel,
  statusText,
} from './room-view';
import { existsSync, readFileSync } from 'node:fs';
import { ROOM_LOOKS, lookVarName, type LookTokens } from '@studylens/shared/room-looks';

describe('landing page', () => {
  const html = renderToStaticMarkup(<Home />);

  it('has the install buttons, the privacy promise and the links', () => {
    expect(html).toContain(`href="${INSTALL_LINKS.firefox}"`);
    expect(html).toContain(`href="${INSTALL_LINKS.edge}"`);
    expect(html).toContain('>Install for Firefox<');
    expect(html).toContain('>Install for Edge<');
    expect(html).toContain('Your browsing stays yours');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain(`href="${GITHUB_URL}"`);
    expect(html).toContain(`href="${FEEDBACK_URL.replace(/&/g, '&amp;')}"`);
  });

  it('shows 4 screenshots with alt text and fixed sizes (no layout shift)', () => {
    const imgs = html.match(/<img [^>]*src="\/media\/(?!icon)[^"]+"[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(4);
    for (const img of imgs) {
      expect(img).toMatch(/alt="[^"]{20,}"/);
      expect(img).toContain('width="1280"');
      expect(img).toContain('height="800"');
    }
  });

  it('phones get a tighter crop of each screenshot, sized, from this site', () => {
    const sources = html.match(/<source [^>]*>/g) ?? [];
    expect(sources).toHaveLength(4);
    for (const source of sources) {
      expect(source).toContain('media="(max-width: 520px)"');
      expect(source).toMatch(/srcSet="\/media\/phone-[a-z-]+\.png"/);
      expect(source).toMatch(/width="\d+" height="\d+"/);
      const name = /srcSet="\/media\/([^"]+)"/.exec(source)![1]!;
      expect(MEDIA[name]).toBeDefined();
    }
  });

  it('mentions the research only briefly and neutrally (study pending advisor + IRB review)', () => {
    expect(html).toContain('tests which focus helpers work');
    expect(html).not.toMatch(
      /hypothes|IRB|recruit|participants? wanted|sign up for the study|result/i,
    );
  });

  it('loads nothing from other sites (no third-party scripts, fonts or images)', () => {
    const srcs = [...html.matchAll(/\s(?:src|srcSet)="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.every((s) => s!.startsWith('/'))).toBe(true);
    expect(html).not.toContain('<script');
  });

  it('every image it serves exists in the repo', () => {
    for (const { file } of Object.values(MEDIA)) expect(existsSync(repoPath(file))).toBe(true);
  });
});

// The live room uses the room looks instead (P21: packages/shared/src/room-looks.test.ts).
describe('Sunrise colors on the web pages meet WCAG AA', () => {
  const t = THEMES.sunrise.tokens;
  const pairs: [string, string, string][] = [
    ['text on page background', t.ink, t.bg],
    ['text on page background (bottom)', t.ink, t.bg2],
    ['muted text on page background', t.muted, t.bg],
    ['muted text on page background (middle)', t.muted, t.bgMid],
    ['muted text on cards', t.muted, t.surface],
    ['links on cards', t.primary, t.surface],
    ['links on page background', t.primary, t.bg],
    ['primary button', t.onPrimary, t.primary],
    ['secondary button', t.primary, t.surface],
    ['code in the policy', t.ink, t.primarySoft],
  ];
  it.each(pairs)('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('/privacy', () => {
  it('renders PRIVACY.md from the repo, headings and lists included', () => {
    const html = privacyHtml();
    expect(html).toContain('<h1>StudyLens Privacy Policy</h1>');
    expect(html).toContain('<h2>Study groups');
    expect(html).toContain('<li>');
  });

  it('points relative repo links to GitHub, leaves others alone', () => {
    expect(absolutizeLinks('<a href="docs/research/codebook.md">x</a>')).toBe(
      `<a href="${GITHUB_URL}/blob/main/docs/research/codebook.md">x</a>`,
    );
    for (const href of ['https://example.org/', '#top', '/privacy', 'mailto:a@b.c']) {
      expect(absolutizeLinks(`<a href="${href}">x</a>`)).toBe(`<a href="${href}">x</a>`);
    }
  });
});

describe('live room', () => {
  const room: LiveRoom = {
    groupName: 'Chem',
    goal: 'Ch. 4',
    plannedMinutes: 25,
    startedAt: 0,
    endsAt: 25 * 60_000,
    state: 'running',
    participants: [
      {
        displayName: 'Sam',
        isHost: true,
        status: 'focusing',
        recentlySeen: true,
        lastSeenMinutesAgo: null,
      },
      {
        displayName: 'Alex',
        isHost: false,
        status: 'left',
        recentlySeen: true,
        lastSeenMinutesAgo: null,
      },
      {
        displayName: 'Kim',
        isHost: false,
        status: 'focusing',
        recentlySeen: false,
        lastSeenMinutesAgo: 3,
      },
      {
        displayName: 'Jo',
        isHost: false,
        status: 'finished',
        recentlySeen: true,
        lastSeenMinutesAgo: null,
      },
    ],
  };

  it('helpers: clock, label, offset, status words', () => {
    expect(formatClock(12 * 60_000 + 4_200)).toBe('12:05');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(-5)).toBe('0:00');
    expect(minutesLeftLabel(60_000)).toBe('1 minute left');
    expect(minutesLeftLabel(0)).toBe('Time is up');
    expect(offsetFrom(1000, 1200, 6100)).toBe(5000);
    expect(participantLabel(room.participants[0]!)).toBe('Sam (started it)');
    expect(room.participants.map(statusText)).toEqual([
      'Focusing',
      'Left early',
      'Away (last seen 3 min ago)',
      'Finished',
    ]);
  });

  it('shows the shared timer, group, goal and everyone’s status in words', () => {
    const html = renderToStaticMarkup(<RoomDetails room={room} now={60_000} />);
    expect(html).toContain('<h1');
    expect(html).toContain('Chem');
    expect(html).toContain('Goal: Ch. 4');
    expect(html).toContain('>24:00<');
    expect(html).toContain('aria-label="24 minutes left"');
    expect(html).toContain('Sam (started it)');
    expect(html).toContain('Left early');
  });

  it('each look: its pill and list title, statuses in its words, dots hidden from readers', () => {
    const cafe = renderToStaticMarkup(<RoomDetails room={room} now={60_000} look="cafe" />);
    expect(cafe).toContain('Café open · live');
    expect(cafe).toContain('At the table');
    expect(cafe).toContain('Stepped away · 3 min');
    const hearth = renderToStaticMarkup(<RoomDetails room={room} now={60_000} look="hearth" />);
    expect(hearth).toContain('Live by the fire');
    expect(hearth).toContain('Around the fire');
    expect(hearth).toContain('Away (last seen 3 min ago)');
    const rainy = renderToStaticMarkup(<RoomDetails room={room} now={60_000} look="rainy" />);
    expect(rainy).toContain('Live · quiet hours');
    expect(rainy).toContain('Lamps on');
    expect(rainy).toContain('Lamp off · 3 min');
    expect(rainy).toContain('class="dot dot-on" aria-hidden="true"');
    expect(rainy).toContain('class="dot dot-off" aria-hidden="true"');
  });

  it('without a look: the café', () => {
    expect(renderToStaticMarkup(<RoomDetails room={room} now={60_000} />)).toContain(
      'Café open · live',
    );
  });

  it('the scenes are decorative (aria-hidden), one per look, colours from the look tokens', () => {
    const html = renderToStaticMarkup(<RoomScenes />);
    expect(html.startsWith('<div class="room-scene" aria-hidden="true">')).toBe(true);
    for (const id of ['hearth', 'cafe', 'rainy']) expect(html).toContain(`scene-${id}`);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('after the end: "Session complete" and 0:00', () => {
    const html = renderToStaticMarkup(
      <RoomDetails room={{ ...room, state: 'ended' }} now={30 * 60_000} />,
    );
    expect(html).toContain('Session complete');
    expect(html).toContain('>0:00<');
  });
});

describe('room look CSS (P21)', () => {
  const css = readFileSync(repoPath('web/app/globals.css'), 'utf8');
  const defined = new Set([
    ...Object.keys(ROOM_LOOKS.cafe.tokens).map((k) => lookVarName(k as keyof LookTokens)),
    lookVarName('display'),
    lookVarName('body'),
  ]);

  it('uses only look variables that exist', () => {
    const used = [...new Set([...css.matchAll(/var\((--lk-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((v) => !defined.has(v))).toEqual([]);
  });

  it('scene animation only under prefers-reduced-motion: no-preference', () => {
    const outside = css.replace(
      /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/g,
      '',
    );
    expect(outside).not.toMatch(/@keyframes|animation:(?!\s*none)/);
  });

  it('has no colours of its own in the room section (they come from the look tokens)', () => {
    const room = css.slice(css.indexOf('/s/<code>: the live room in three looks'));
    expect(room).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
