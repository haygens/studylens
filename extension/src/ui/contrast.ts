/**
 * WCAG 2.x contrast ratio between two colors (P13b), used by the theme tests to prove every
 * theme passes AA. Pure functions, no browser APIs.
 */

/** Relative luminance of a `#rrggbb` color. */
export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Not a #rrggbb color: ${hex}`);
  const n = parseInt(match[1]!, 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio from 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA: 4.5:1 for normal text, 3:1 for large text and for controls / graphics. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;
