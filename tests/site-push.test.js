/**
 * « Tell me when someone writes » — the listener's side (site/js/ui/push.js,
 * site/sw.js, site/manifest.webmanifest).
 *
 * What must hold:
 *   - the three cases are told apart: a browser that can be told, an iPhone
 *     in a Safari tab (which must be sent to the Home Screen first), the rest;
 *   - nothing is registered, asked or subscribed until the listener taps;
 *   - the service worker caches nothing and answers no request — it can never
 *     serve an old copy of the site — and only ever opens a page of the site;
 *   - the site can be added to a Home Screen: a manifest, its icons, the links.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { support, keyBytes, plainSubscription, HINTS } from '../site/js/ui/push.js';
import { generateKeys, fromB64u } from '../server/lib/webpush.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('who can be told: a browser with Web Push, an iPhone that must use the Home Screen first, nobody else', () => {
  const chrome = { navigator: { serviceWorker: {}, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' }, PushManager: class {}, Notification: class {} };
  assert.equal(support(chrome), 'ok');
  const iphoneTab = { navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1', serviceWorker: {} }, matchMedia: () => ({ matches: false }) };
  assert.equal(support(iphoneTab), 'ios-home', 'a Safari tab has no PushManager at all: say how, do not offer a dead button');
  const ipad = { navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', maxTouchPoints: 5 }, matchMedia: () => ({ matches: false }) };
  assert.equal(support(ipad), 'ios-home', 'an iPad says it is a Mac; a Mac has no touch points');
  const iphoneHome = { navigator: { userAgent: iphoneTab.navigator.userAgent, serviceWorker: {}, standalone: true }, PushManager: class {}, Notification: class {} };
  assert.equal(support(iphoneHome), 'ok', 'opened from the Home Screen, an iPhone can');
  const oldIphoneHome = { navigator: { userAgent: iphoneTab.navigator.userAgent, standalone: true } };
  assert.equal(support(oldIphoneHome), 'none', 'on the Home Screen but too old for Web Push (before iOS 16.4): nothing to offer');
  assert.equal(support({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', maxTouchPoints: 0 } }), 'none');
  assert.equal(support({}), 'none');
  assert.match(HINTS['ios-home'], /Add to Home Screen/);
  assert.ok(HINTS['ios-home'].length < 170, 'one sentence');
});

test('the tower\'s key reaches the browser as bytes; a subscription leaves it as the endpoint and two keys, nothing else', () => {
  const { publicKey } = generateKeys();
  const bytes = keyBytes(publicKey);
  assert.equal(bytes.length, 65);
  assert.deepEqual(Buffer.from(bytes), fromB64u(publicKey));
  const sub = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', expirationTime: null, keys: { p256dh: 'p', auth: 'a' }, extra: 'no' }) };
  assert.deepEqual(plainSubscription(sub), { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } });
  assert.equal(plainSubscription({ endpoint: 'x' }), null);
  assert.equal(plainSubscription(null), null);
});

// « nothing is registered, asked or subscribed until the station taps the bell — and the Antenna has none » read push.js,
// telegraph.js, line-admin.js, transport.js, main.js and index.html for words until 2026-11-25 (TESTS-REVIEW §3). The site
// smoke does it for real (scripts/smoke/tower.mjs, the line's notifications): the Antenna has no bell; on the Booth
// nothing is asked, registered or subscribed before the tap; the tap asks once, registers sw.js and subscribes with the
// tower's key — which the tower refuses without the station key.

/**
 * The service worker, run (TESTS-REVIEW §3: behaviour, not source text — until 2026-11-25 this read sw.js for words).
 * A stand-in `self` records what it listens to and what it does; there is no `caches` and no `importScripts` in it,
 * so a worker that reached for either would throw here.
 */
function runWorker({ scope = 'https://site.example/', pages = [] } = {}) {
  const on = {};
  const did = { shown: [], opened: [], posted: [], focused: 0, skipped: 0 };
  const self = {
    addEventListener: (type, fn) => { on[type] = fn; },
    skipWaiting: () => { did.skipped++; },
    clients: {
      claim: async () => {},
      matchAll: async () => pages.map((url) => ({ url, postMessage: (m) => did.posted.push(m), focus: async () => { did.focused++; } })),
      openWindow: async (href) => { did.opened.push(href); },
    },
    registration: { scope, showNotification: async (title, opts) => { did.shown.push({ title, ...opts }); } },
  };
  vm.runInNewContext(read('site/sw.js'), { self, URL, String });
  const fire = async (type, event) => { let wait = null; on[type]({ waitUntil: (p) => { wait = p; }, ...event }); await wait; };
  return { on, did, fire };
}

test('the service worker caches nothing, answers no request, and only opens a page of the site', async () => {
  const { on, did, fire } = runWorker();
  assert.deepEqual(Object.keys(on).sort(), ['activate', 'install', 'notificationclick', 'push'], 'no fetch handler: it can never serve an old site');
  on.install();
  assert.equal(did.skipped, 1);

  await fire('push', { data: { json: () => ({ title: 'Ada wrote', body: 'hello', url: 'antenna' }) } });
  assert.equal(did.shown.length, 1, 'every push shows a notification');
  assert.equal(did.shown[0].title, 'Ada wrote');
  await fire('push', { data: { json: () => { throw new Error('not JSON'); }, text: () => 'plain words' } });
  assert.equal(did.shown[1].body, 'plain words', 'a push that is not JSON still shows, as text');

  const click = (url) => ({ notification: { data: { url }, close() {} } });
  for (const away of ['https://elsewhere.example/x', 'javascript:alert(1)', 'data:text/html,hi']) {
    const w = runWorker();
    await w.fire('notificationclick', click(away));
    assert.deepEqual(w.did.opened, ['https://site.example/antenna'], `${away}: a route that would leave the site is replaced by the Antenna`);
  }
  // A protocol-relative address loses its leading slashes and is read inside the site (a page of it, maybe a missing one).
  const rel = runWorker();
  await rel.fire('notificationclick', click('//elsewhere.example/'));
  assert.ok(rel.did.opened[0].startsWith('https://site.example/'), `//elsewhere.example/ stays on the site: ${rel.did.opened[0]}`);
  const home = runWorker();
  await home.fire('notificationclick', click('/echo/articles'));
  assert.deepEqual(home.did.opened, ['https://site.example/echo/articles'], 'with no page open, it opens the one asked for, on the site');

  const playing = runWorker({ pages: ['https://site.example/radio'] });
  await playing.fire('notificationclick', click('antenna'));
  // (made in the worker's own realm: compared as plain data)
  assert.deepEqual(JSON.parse(JSON.stringify(playing.did.posted)), [{ type: 'go', route: 'antenna' }], 'an open page is asked to go there itself — reloading it would cut the music');
  assert.equal(playing.did.focused, 1);
  assert.deepEqual(playing.did.opened, [], 'and no second window opens');
  // The page's half (main.js: a 'go' message → its router, the music playing on) is the site smoke's, world part.
});

test('the site can be added to a Home Screen: a manifest, its icons, and the page says so', () => {
  const m = JSON.parse(read('site/manifest.webmanifest'));
  assert.equal(m.display, 'standalone', 'what an iPhone needs before it lets a site send notifications');
  assert.ok(m.name && m.short_name && m.start_url && m.scope);
  assert.ok(!/^(\/|https?:)/.test(m.start_url) && !/^(\/|https?:)/.test(m.scope), 'relative, so the site still works under a sub-path');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  const png = (file) => { const b = fs.readFileSync(path.join(ROOT, 'site', file)); return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  for (const i of m.icons) assert.deepEqual(png(i.src), i.sizes.split('x').map(Number), `${i.src} is a PNG of the size it says`);
  assert.deepEqual(png('assets/app-180.png'), [180, 180]);
  assert.deepEqual(png('assets/app-badge.png'), [96, 96]);
  const html = read('site/index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="assets\/app-180\.png">/);
});
