/**
 * Every color in the UI must come from the theme (P13b). This keeps Study / Neutral /
 * Distraction (and everything else) the same on every screen within a theme, and makes the
 * contrast tests in themes.test.ts cover what users actually see.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ALLOWED = new Set([path.join('src', 'ui', 'themes.ts')]);

function uiFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return uiFiles(rel);
    return /\.(tsx|css|html)$/.test(name) || (/\.ts$/.test(name) && dir.includes('ui'))
      ? [rel]
      : [];
  });
}

const FILES = [...uiFiles('entrypoints'), ...uiFiles(path.join('src', 'ui'))].filter(
  (f) => !ALLOWED.has(f) && !f.endsWith('.test.ts'),
);
const COLOR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;

describe('UI colors come from the theme', () => {
  it('finds the UI files', () => {
    expect(FILES.length).toBeGreaterThan(15);
  });

  it.each(FILES)('%s has no hard-coded colors', (file) => {
    const lines = readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    const found = lines
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => COLOR.test(line.replace(/href=["'][^"']*["']/g, '')));
    expect(found.map(({ n, line }) => `${file}:${n}: ${line}`)).toEqual([]);
  });
});
