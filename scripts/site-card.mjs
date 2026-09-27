#!/usr/bin/env node
/**
 * Render the link-preview card — site/assets/share-card.jpg, 1200×630 (a JPEG: WhatsApp drops previews over 300 KB) — the
 * picture a chat app or a social network shows when someone pastes the
 * site's address (og:image in site/index.html).
 *
 * Drawn from the site itself, not designed separately: the same stylesheet
 * (its tokens), the same mark, the same Atlas map with the places and the
 * tower's origin from config.json. So when the palette, the places or the
 * broadcast location change, re-running this keeps the card honest:
 *
 *   node scripts/site-card.mjs
 *
 * Needs Playwright's Chromium (a devDependency); it is not part of the build,
 * and the JPEG is committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapSvg } from '../site/js/pages/atlas.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const OUT = path.join(ROOT, 'site/assets/share-card.jpg');

export function cardHtml() {
  const css = read('site/css/site.css');
  const world = JSON.parse(read('site/data/world.json'));
  const places = JSON.parse(read('site/data/places.json')).places || [];
  const config = JSON.parse(read('site/config.json'));
  const origin = config.station?.origin || null;
  const site = config.site || {};
  const mark = read('site/index.html').match(/<symbol id="mark"[\s\S]*?<\/symbol>/)[0];
  const map = mapSvg(world, places, origin, { compact: true });

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}
  html,body{width:1200px;height:630px;overflow:hidden;padding:0}
  body{background:radial-gradient(900px 520px at 78% 40%, #16202a 0%, transparent 70%), radial-gradient(700px 420px at 12% 110%, rgba(52,211,153,.10) 0%, transparent 70%), var(--bg)}
  .card{position:relative;width:1200px;height:630px}
  .map{position:absolute;right:-110px;top:40px;width:980px;opacity:.95}
  .map svg{width:100%;height:auto;display:block}
  .map .tower-pin .wave{animation:none;opacity:.55}
  .map .tower-pin .wave:nth-child(1){transform:scale(1.6)}
  .map .tower-pin .wave:nth-child(2){transform:scale(3.2);opacity:.3}
  .map .tower-pin .wave:nth-child(3){transform:scale(5);opacity:.14}
  .veil{position:absolute;inset:0;background:linear-gradient(90deg, var(--bg) 0%, rgba(11,13,16,.92) 34%, rgba(11,13,16,.35) 62%, rgba(11,13,16,0) 80%)}
  .copy{position:absolute;left:72px;top:64px;bottom:60px;width:640px;display:flex;flex-direction:column}
  .mk{color:var(--signal);filter:drop-shadow(0 0 22px rgba(52,211,153,.45))}
  h1{font:600 104px/0.98 var(--serif);letter-spacing:-.02em;margin:26px 0 14px;color:var(--text)}
  .by{font:500 24px var(--mono);color:var(--text-dim);letter-spacing:.02em}
  .by b{color:var(--signal);font-weight:600}
  .tag{font:italic 31px/1.35 var(--serif);color:var(--text);opacity:.92;margin-top:30px;max-width:15.5em}
  .rooms{margin-top:auto;display:flex;gap:12px;align-items:center}
  .rooms span{font:500 19px var(--font);color:var(--text-dim);border:1px solid var(--line);border-radius:999px;padding:9px 18px;background:rgba(18,22,27,.8)}
  .rooms .air{color:var(--signal);border-color:rgba(52,211,153,.45);display:inline-flex;align-items:center;gap:10px;font:600 16px var(--mono);letter-spacing:.14em}
  .rooms .air i{width:10px;height:10px;border-radius:50%;background:var(--signal);box-shadow:0 0 12px var(--signal)}
  </style></head><body><div class="card">
    <div class="map">${map}</div>
    <div class="veil"></div>
    <div class="copy">
      <svg class="mk" width="92" height="92" viewBox="0 0 32 32" aria-hidden="true">${mark.replace(/<\/?symbol[^>]*>/g, '')}</svg>
      <h1>${site.title || 'Globe Trotter'}</h1>
      <div class="by">Radio Tower · par <b>${site.author || 'Zoneko'}</b></div>
      <p class="tag">Une radio où tout le monde entend la même seconde.</p>
      <div class="rooms"><span class="air"><i></i>ON AIR</span><span>Radio</span><span>Atlas</span><span>Écrits</span><span>Portfolio</span></div>
    </div>
  </div></body></html>`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { chromium } = await import('playwright');
  const opts = { args: ['--no-sandbox'] };
  const exe = process.env.TOWER_BROWSER_EXECUTABLE || process.env.CHROME_PATH;
  if (exe) opts.executablePath = exe;
  const browser = await chromium.launch(opts);
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(cardHtml(), { waitUntil: 'load' });
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 90 });
  await browser.close();
  console.log(`  ✓ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}
