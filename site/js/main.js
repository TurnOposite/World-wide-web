/**
 * Boot. Connect to the station (in-browser or a real tower), start the one
 * player and the one visualiser that live for the whole visit, then let the
 * router swap pages around them.
 */
import { connect } from './engine/transport.js';
import { Player } from './player.js';
import { Stage } from './viz/stage.js';
import { VisualSettings } from './viz/settings.js';
import { Router } from './router.js';
import { mountMinibar } from './ui/minibar.js';
import { VisualsPanel } from './ui/visuals.js';
import { toast, esc } from './ui/util.js';
import { initBanner, markHalf } from './ui/banner.js';
import { ONDES_LABEL } from './labels.js';
import { worldWanted } from './world/flag.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

initBanner();
globalThis.__markHalf = markHalf;
const settings = new VisualSettings({ reducedMotion: reduced.matches });
let sceneFn = () => null;
const ambientScene = () => {
  const b = $('mbTune')?.getBoundingClientRect();
  return { mode: 'ambient', anchor: b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null, bottomInset: $('minibar')?.offsetHeight ?? 70 };
};

const stage = new Stage($('stage'), {
  settings: () => settings.effective,
  scene: () => sceneFn() || ambientScene(),
  reducedMotion: reduced.matches,
});
reduced.addEventListener?.('change', (e) => { stage.reducedMotion = e.matches; });

function theatre(on = !document.body.classList.contains('theatre')) {
  document.body.classList.toggle('theatre', on);
  let exit = document.querySelector('.theatre-exit');
  if (on && !exit) {
    exit = document.createElement('button');
    exit.className = 'btn small theatre-exit';
    exit.type = 'button';
    exit.textContent = 'Exit full screen';
    exit.onclick = () => theatre(false);
    document.body.append(exit);
  } else if (!on) exit?.remove();
  try {
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } catch { /* optional everywhere */ }
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) theatre(false); });

// Canopy big behind the page: the panels turn to glass so the cube shows through (site.css).
const markCanopy = (s) => document.body.classList.toggle('canopy-back', Boolean(s.layers.callmap) && s.canopy !== 'front' && s.intensity > 0);
settings.subscribe(markCanopy);
markCanopy(settings.effective);

const visuals = new VisualsPanel({ root: $('visualsPanel'), settings, openers: [$('mbVisuals')], theatre: () => theatre() });

async function boot() {
  let client;
  try {
    client = await connect({ base: document.baseURI });
  } catch (err) {
    view.innerHTML = `<div class="panel" style="margin-top:24px"><h3>The station did not start</h3>
      <p>${esc(err.message)}</p><p class="hint">The site could not read <code>station/library.json</code>. If you are opening the files directly from disk, serve the folder instead: <code>npm run site</code>.</p></div>`;
    return;
  }

  // Site identity from config.json
  const site = client.config.site || {};
  if (site.title) $('siteTitle').textContent = site.title;
  if (site.author) { $('siteAuthor').textContent = site.author; document.querySelector('.sitefoot .credit').textContent = site.author; }
  $('footMode').textContent = client.mode === 'cloud' ? 'no server — the schedule is the clock' : `tuned to ${client.origin}`;

  // A preview build (scripts/site-preview.mjs) says plainly what it is not.
  const preview = client.config.preview;
  if (preview?.note) {
    const note = document.createElement('p');
    note.className = 'preview-note';
    note.id = 'previewNote';
    note.textContent = preview.note;
    document.querySelector('.masthead')?.after(note);
    if (preview.foot) $('footMode').textContent = preview.foot;
  }

  settings.setBroadcast(client.look);
  client.on?.('control', () => settings.setBroadcast(client.look));

  const player = new Player(client, $('audio'), { stage });
  player.start();
  stage.start();
  mountMinibar({ player, stage });

  // Zone's visualiser belongs to Zone: on every Echo route it is hidden (CSS, body.on-echo)
  // and paused here, so it costs no CPU behind the paper.
  let onEcho = false;
  const syncStage = () => (document.hidden || onEcho ? stage.stop() : stage.start());
  globalThis.__echoStage = (on) => { onEcho = on; syncStage(); };
  document.addEventListener('visibilitychange', syncStage);

  // Titles of the texts, for "the score of …" links — loaded once, lazily.
  let textTitles = null;
  fetch(new URL('data/texts.json', document.baseURI)).then((r) => r.json()).then((j) => {
    textTitles = new Map((j.texts || []).map((t) => [t.slug, t.title]));
  }).catch(() => {});

  document.querySelectorAll('[data-ondes-label]').forEach((el) => { el.textContent = ONDES_LABEL; });

  const ctx = {
    client, player, stage, settings, visuals, toast, theatre,
    config: client.config,
    setScene: (fn) => { sceneFn = fn; },
    textTitle: (slug) => textTitles?.get(slug) || null,
  };

  let cleanup = null;
  // The world shell (docs/WORLD.md), behind a flag: config.world, or ?world=1 for this tab.
  // Off, nothing under world/ but the flag is loaded and the site is the classic one.
  let world = null;
  let session = null;
  try { session = sessionStorage; } catch { /* storage blocked: the flag lasts this page */ }
  const wantWorld = worldWanted({ config: client.config, search: location.search, storage: session });
  const router = new Router({
    mode: client.config.router === 'hash' ? 'hash' : 'history',
    routes: [
      // In the world the home is the world itself, the camera on Radio (docs/WORLD.md, open question 2).
      { name: 'home', pattern: /^$/, load: () => (world ? import('./pages/radio.js') : import('./pages/home.js')) },
      { name: 'radio', pattern: /^radio$/, load: () => import('./pages/radio.js') },
      { name: 'ondes', pattern: /^(?:ondes|echoes)$/, load: () => import('./pages/ondes.js') },
      { name: 'playlists', pattern: /^playlists$/, load: () => import('./pages/playlists.js') },
      { name: 'atlas', pattern: /^atlas$/, load: () => import('./pages/atlas.js') },
      { name: 'lectures', pattern: /^echo\/lectures(?:\/(?<slug>[\w-]+))?$/, load: () => import('./pages/ecrits.js') },
      // Old address of the reading section: kept alive, and moved to /echo/lectures by the page.
      { name: 'zone', pattern: /^zone$/, load: () => import('./pages/zone.js') },
      { name: 'ecrits', pattern: /^ecrits(?:\/(?<slug>[\w-]+))?$/, load: () => import('./pages/ecrits.js') },
      { name: 'echo', pattern: /^echo(?:\/(?<slug>[\w-]+))?$/, load: () => import('./pages/echo.js') },
      { name: 'portfolio', pattern: /^portfolio(?:\/(?<room>[\w-]+))?$/, load: () => import('./pages/portfolio.js') },
      { name: 'booth', pattern: /^booth$/, load: () => import('./pages/booth.js') },
      { name: 'missing', pattern: /.*/, load: () => import('./pages/missing.js') },
    ],
    render: async (page, match, { fromPop, isCurrent = () => true }) => {
      try { cleanup?.(); } catch (e) { console.error(e); }
      cleanup = null;
      const echoRoute = ['echo', 'lectures', 'ecrits'].includes(match.name);
      document.body.classList.toggle('on-echo', echoRoute);
      globalThis.__echoStage?.(echoRoute);
      // With the world on, the page opens in its district's window, not in <main>.
      const place = world?.show(match) || null;
      const host = place?.box || view;
      sceneFn = () => null;
      if (!place) {
        view.classList.remove('entering');
        void view.offsetWidth;
        view.classList.add('entering');
      }
      document.title = page.title ? `${page.title} — ${site.title || 'Globe Trotter'}` : (site.title || 'Globe Trotter');
      // Each page gets its own box inside <main> (or its district). A page
      // still loading when the reader moves on keeps working on its own box —
      // never on the page that replaced it — and is cleaned up the moment
      // it finishes.
      const root = document.createElement('div');
      root.className = 'page';
      host.replaceChildren(root);
      const done = (await page.mount(root, {
        ...ctx, router, params: match.params,
        setScene: (fn) => { if (isCurrent()) sceneFn = fn; },
      })) || null;
      if (!isCurrent()) { try { done?.(); } catch (e) { console.error(e); } return; }
      cleanup = done;
      if (!fromPop) {
        if (place) place.focus();
        else {
          window.scrollTo({ top: 0 });
          view.focus({ preventScroll: true });
        }
      }
    },
  });
  ctx.router = router;
  if (wantWorld) world = await (await import('./world/world.js')).mountWorld({ router, site });
  await router.start();

  // Keys: V visuals, F full screen, M tune in / mute. Never while typing.
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'v') { visuals.toggle(); e.preventDefault(); }
    else if (k === 'f') { theatre(); e.preventDefault(); }
    else if (k === 'm') { player.toggle(); e.preventDefault(); }
  });

  // For the e2e tests and for curious listeners with a console open.
  globalThis.radioTower = { client, player, stage, settings, router, world };
}

boot();
