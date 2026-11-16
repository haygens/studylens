/**
 * Renders assets/icon.svg to the PNG sizes the extension needs (public/icon/<size>.png, which WXT
 * picks up automatically). Uses the Playwright library we already have for E2E tests and the
 * installed Microsoft Edge, so there is no extra image dependency and no browser download.
 *
 * Run after editing the SVG: `npm run icons -w extension`. The PNGs are committed.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 96, 128];
const svg = readFileSync(fileURLToPath(new URL('../assets/icon.svg', import.meta.url)), 'utf8');
const outDir = fileURLToPath(new URL('../public/icon/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}</style>` +
        `<img src="${src}" width="${size}" height="${size}" style="display:block">`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({
      path: `${outDir}${size}.png`,
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(`✓ public/icon/${size}.png`);
  }
} finally {
  await browser.close();
}
