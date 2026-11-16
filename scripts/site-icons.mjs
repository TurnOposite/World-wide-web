#!/usr/bin/env node
/**
 * Re-draw the home-screen icons (site/assets/app-*.png) from the station's
 * mark (site/assets/mark.svg). They are what a phone shows when the site is
 * added to the Home Screen — which is the only way an iPhone lets a website
 * send notifications (site/js/ui/push.js) — and beside a notification.
 *
 *   node scripts/site-icons.mjs
 *
 * Needs a browser (Playwright; TOWER_BROWSER_EXECUTABLE or CHROME_PATH for a
 * system Chrome). Run it after changing the mark or the palette; the PNGs are
 * committed, so nothing else depends on a browser being there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'site', 'assets');
const mark = fs.readFileSync(path.join(ASSETS, 'mark.svg'), 'utf8');

// The mark at 62 % of the square: inside the circle a « maskable » icon may be cropped to (80 %).
const page = (size, { bg = '#0b0d10', ink = null } = {}) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${size}px;height:${size}px;background:${bg}}
  body{display:grid;place-items:center}
  svg{width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px}
</style>${ink ? mark.replaceAll('#34d399', ink) : mark}`;

const ICONS = [
  ['app-512.png', 512, {}],
  ['app-192.png', 192, {}],
  ['app-180.png', 180, {}], // apple-touch-icon
  ['app-badge.png', 96, { bg: 'transparent', ink: '#ffffff' }], // Android's status-bar badge: white on nothing
];

const exe = process.env.TOWER_BROWSER_EXECUTABLE || process.env.CHROME_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
try {
  for (const [name, size, opts] of ICONS) {
    const p = await (await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })).newPage();
    await p.setContent(page(size, opts));
    await p.screenshot({ path: path.join(ASSETS, name), omitBackground: opts.bg === 'transparent' });
    await p.context().close();
    console.log(`  ✓ site/assets/${name} (${size}×${size}, ${fs.statSync(path.join(ASSETS, name)).size} bytes)`);
  }
} finally {
  await browser.close();
}
