/**
 * P18c: /privacy renders the repository's PRIVACY.md at build time (single source of truth).
 * The file is our own, reviewed text; links to other repo files point to GitHub.
 */
import { readFileSync } from 'node:fs';
import { marked } from 'marked';
import { GITHUB_URL } from '@studylens/shared/links';
import { repoPath } from './repo-files';

/** Relative links (e.g. `docs/research/codebook.md`) → the file on GitHub. */
export function absolutizeLinks(html: string): string {
  return html.replace(/href="(?!https?:|mailto:|#|\/)([^"]+)"/g, (_m, rel: string) => {
    return `href="${GITHUB_URL}/blob/main/${rel.replace(/^\.\//, '')}"`;
  });
}

export function privacyHtml(markdown = readFileSync(repoPath('PRIVACY.md'), 'utf8')): string {
  return absolutizeLinks(marked.parse(markdown, { async: false, gfm: true }));
}
