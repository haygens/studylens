import { readFileSync } from 'node:fs';
import { MEDIA, repoPath } from '@/lib/site/repo-files';

/**
 * GET /media/<name> (P18c): the store screenshots and the icon, straight from the repo
 * (docs/store/screenshots, extension/public/icon), prerendered at build time. Only the names in
 * the allowlist exist.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(MEDIA).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const media = MEDIA[name];
  if (!media) return new Response('Not found', { status: 404 });
  return new Response(readFileSync(repoPath(media.file)), {
    headers: {
      'Content-Type': media.type,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
