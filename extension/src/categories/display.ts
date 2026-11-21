/**
 * Display names for categories, shared by every page. Colors and icons live in the theme
 * (src/ui/themes.ts) and src/ui/CategoryChip.tsx, so they are the same on every screen.
 */
import type { SiteCategory } from '@studylens/shared';

export const CATEGORY_LABELS: Record<SiteCategory, string> = {
  study: 'Study',
  neutral: 'Neutral',
  distraction: 'Distraction',
};
