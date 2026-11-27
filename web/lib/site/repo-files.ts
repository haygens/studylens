/**
 * P18c: files from the repository that the web companion shows (PRIVACY.md, store screenshots,
 * the icon), read at BUILD time so the repo stays the single source of truth. `next build` and
 * `next dev` run in web/ (the repo root is one level up); tests may run from the repo root.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

export function repoPath(relative: string): string {
  // Build-time only (static pages and routes): tell the bundler not to trace the whole repo.
  const cwd = process.cwd();
  for (const base of [path.join(/*turbopackIgnore: true*/ cwd, '..'), cwd]) {
    const candidate = path.join(/*turbopackIgnore: true*/ base, relative);
    if (existsSync(/*turbopackIgnore: true*/ candidate)) return candidate;
  }
  throw new Error(`Repository file not found: ${relative}`);
}

/** Images the site serves from the repo: published name → repo path (an allowlist). */
export const MEDIA: Record<string, { file: string; type: string }> = {
  'focus-session.png': { file: 'docs/store/screenshots/1-focus-session.png', type: 'image/png' },
  'friction-countdown.png': {
    file: 'docs/store/screenshots/2-friction-countdown.png',
    type: 'image/png',
  },
  'intention-question.png': {
    file: 'docs/store/screenshots/3-intention-question.png',
    type: 'image/png',
  },
  'insights.png': { file: 'docs/store/screenshots/4-insights.png', type: 'image/png' },
  // Tighter crops for phones (npm run screenshots:crop -w extension).
  'phone-focus-session.png': {
    file: 'docs/store/screenshots/phone/focus-session.png',
    type: 'image/png',
  },
  'phone-friction-countdown.png': {
    file: 'docs/store/screenshots/phone/friction-countdown.png',
    type: 'image/png',
  },
  'phone-intention-question.png': {
    file: 'docs/store/screenshots/phone/intention-question.png',
    type: 'image/png',
  },
  'phone-insights.png': { file: 'docs/store/screenshots/phone/insights.png', type: 'image/png' },
  'icon-128.png': { file: 'extension/public/icon/128.png', type: 'image/png' },
  'icon-48.png': { file: 'extension/public/icon/48.png', type: 'image/png' },
};
