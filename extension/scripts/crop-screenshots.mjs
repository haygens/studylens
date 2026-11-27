/**
 * P18c polish: tighter crops of the store screenshots for the landing page on phones (just the
 * popup or the helper card, so the text stays readable at ~360 px). Reads
 * docs/store/screenshots/<n>-<name>.png, writes docs/store/screenshots/phone/<name>.png.
 * Uses Playwright + the installed Edge (no extra image dependency, no browser download), drawing
 * each image at 1:1 and screenshotting the crop, so pixels are copied unscaled.
 *
 * Run after `npm run screenshots -w extension`: `npm run screenshots:crop -w extension`.
 * The PNGs are committed.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../docs/store/screenshots/', import.meta.url));
const OUT = `${SRC}phone/`;

/**
 * Crop boxes in the 1280 × 800 store screenshots. An image may be made of several parts stacked
 * top to bottom (Insights: the card title, then the table, skipping a long sentence that would be
 * cut off at this width).
 */
const CROPS = [
  { from: '1-focus-session.png', to: 'focus-session.png', parts: [[716, 38, 332, 726]] },
  { from: '2-friction-countdown.png', to: 'friction-countdown.png', parts: [[416, 158, 448, 484]] },
  { from: '3-intention-question.png', to: 'intention-question.png', parts: [[428, 188, 424, 426]] },
  {
    from: '4-insights.png',
    to: 'insights.png',
    parts: [
      [297, 108, 518, 50],
      [297, 204, 518, 150],
    ],
  },
];

/** HTML showing the parts of `src` stacked, each in a window of its own size. */
function stacked(src, parts) {
  const windows = parts
    .map(
      ([x, y, w, h]) =>
        `<div style="width:${w}px;height:${h}px;overflow:hidden">` +
        `<img src="${src}" width="1280" height="800" style="display:block;margin:-${y}px 0 0 -${x}px"></div>`,
    )
    .join('');
  return `<style>html,body{margin:0}</style><div id="crop" style="display:inline-block">${windows}</div>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge' });
try {
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { width: 1280, height: 800 },
  });
  for (const c of CROPS) {
    const src = `data:image/png;base64,${readFileSync(SRC + c.from).toString('base64')}`;
    await page.setContent(stacked(src, c.parts));
    await Promise.all(
      (await page.locator('img').all()).map((img) => img.evaluate((i) => i.decode())),
    );
    const crop = page.locator('#crop');
    await crop.screenshot({ path: OUT + c.to });
    const box = await crop.boundingBox();
    console.log(`${c.to} (${box?.width} × ${box?.height})`);
  }
} finally {
  await browser.close();
}
