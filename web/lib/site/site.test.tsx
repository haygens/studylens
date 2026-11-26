/** P18c: the web companion's pages and helpers (rendered to static HTML, no browser needed). */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AA_TEXT, contrastRatio } from '@studylens/shared/contrast';
import { FEEDBACK_URL, GITHUB_URL, INSTALL_LINKS } from '@studylens/shared/links';
import { THEMES } from '@studylens/shared/themes';
import type { LiveRoom } from '@studylens/shared';
import Home from '@/app/page';
import { RoomDetails } from '@/app/s/[code]/RoomView';
import { MEDIA, repoPath } from './repo-files';
import { absolutizeLinks, privacyHtml } from './privacy';
import {
  formatClock,
  minutesLeftLabel,
  offsetFrom,
  participantLabel,
  statusText,
} from './room-view';
import { existsSync } from 'node:fs';

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

  it('mentions the research only briefly and neutrally (study pending advisor + IRB review)', () => {
    expect(html).toContain('tests which focus helpers work');
    expect(html).not.toMatch(
      /hypothes|IRB|recruit|participants? wanted|sign up for the study|result/i,
    );
  });

  it('loads nothing from other sites (no third-party scripts, fonts or images)', () => {
    const srcs = [...html.matchAll(/\ssrc="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.every((s) => s!.startsWith('/'))).toBe(true);
    expect(html).not.toContain('<script');
  });

  it('every image it serves exists in the repo', () => {
    for (const { file } of Object.values(MEDIA)) expect(existsSync(repoPath(file))).toBe(true);
  });
});

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
    ['live chip', t.study, t.studySoft],
    ['ended chip', t.neutral, t.neutralSoft],
    ['focusing status on rows', t.study, t.bg],
    ['finished status on rows', t.primary, t.bg],
    ['left status on rows', t.muted, t.bg],
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
      { displayName: 'Sam', isHost: true, status: 'focusing', recentlySeen: true },
      { displayName: 'Alex', isHost: false, status: 'left', recentlySeen: true },
      { displayName: 'Kim', isHost: false, status: 'focusing', recentlySeen: false },
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
      'Focusing · not seen for a few minutes',
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

  it('after the end: "Session complete" and 0:00', () => {
    const html = renderToStaticMarkup(
      <RoomDetails room={{ ...room, state: 'ended' }} now={30 * 60_000} />,
    );
    expect(html).toContain('Session complete');
    expect(html).toContain('>0:00<');
  });
});
