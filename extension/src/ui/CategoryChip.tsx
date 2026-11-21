/**
 * Study / Neutral / Distraction label (P13b): icon + word + theme color, so the meaning never
 * depends on color alone. The same chip is used on every screen.
 */
import type { SiteCategory } from '@studylens/shared';
import { CATEGORY_LABELS } from '../categories/display';
import { BoltIcon, BookIcon, DotIcon } from './icons';

export const CATEGORY_ICONS: Record<SiteCategory, () => React.JSX.Element> = {
  study: BookIcon,
  neutral: DotIcon,
  distraction: BoltIcon,
};

export default function CategoryChip({ category }: { category: SiteCategory }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className={`sl-chip sl-chip-${category}`}>
      <Icon />
      {CATEGORY_LABELS[category]}
    </span>
  );
}
