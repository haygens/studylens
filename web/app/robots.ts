import type { MetadataRoute } from 'next';

/** P18c: the landing page and /privacy may be indexed; rooms and the API never. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/s/', '/api/'] }] };
}
