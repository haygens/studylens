import pkg from '@/package.json';

/** The web app's version (web/package.json), reported by GET /api/health. */
export const VERSION: string = pkg.version;
