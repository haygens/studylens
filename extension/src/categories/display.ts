/** Display names and colors for categories, shared by the popup and options page. */
import type { SiteCategory } from '@studylens/shared';

export const CATEGORY_LABELS: Record<SiteCategory, string> = {
  study: 'Study',
  neutral: 'Neutral',
  distraction: 'Distraction',
};

export const CATEGORY_COLORS: Record<SiteCategory, string> = {
  study: '#1a7f37',
  neutral: '#6e7781',
  distraction: '#cf222e',
};
