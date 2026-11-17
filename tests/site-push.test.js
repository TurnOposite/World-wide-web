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

test('nothing is registered, asked or subscribed until the station taps the bell — and the Antenna has none', () => {
  const src = read('site/js/ui/push.js');
  const cur = src.slice(src.indexOf('export async function current()'), src.indexOf('export async function subscribe'));
  assert.doesNotMatch(cur, /requestPermission|\.register\(|\.subscribe\(|create: true/, 'looking for an existing subscription asks for nothing');
  // Ortis, 2026-11-17: « the notifications should only be accessible to me, so it doesn't have to appear on the antenna ».
  assert.doesNotMatch(read('site/js/ui/telegraph.js'), /push\.|tgNotify|tell me when someone writes/, 'the listener\'s line offers nothing of it');
  const admin = read('site/js/ui/line-admin.js');
  assert.match(admin, /\$\('laNotify'\)\.addEventListener\('click', \(\) => this\._toggleNotify\(\)\)/, 'subscribing happens from the Booth\'s bell');
  assert.equal(admin.match(/push\.subscribe\(/g).length, 1);
  assert.ok(admin.indexOf('push.subscribe(') > admin.indexOf('async _toggleNotify('), '…and from nowhere else');
  assert.match(read('site/js/engine/transport.js'), /telegraph\/subscribe`, \{ method: 'POST', headers: \{ 'Content-Type': 'application\/json', 'x-station-key': this\.key/, 'with the station key');
  for (const f of ['site/js/main.js', 'site/index.html']) assert.doesNotMatch(read(f), /serviceWorker\.register|requestPermission/, `${f} registers nothing on arrival`);
});

test('the service worker caches nothing, answers no request, and only opens a page of the site', () => {
  const sw = read('site/sw.js');
  const code = sw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /addEventListener\('fetch'|caches\.|importScripts/, 'no fetch handler, no cache: it can never serve an old site');
  assert.match(code, /showNotification\(/);
  assert.match(code, /!target\.href\.startsWith\(scope\)/, 'a route that would leave the site is replaced by the Antenna');
  assert.match(code, /postMessage\(\{ type: 'go'/, 'an open page is asked to go there itself — reloading it would cut the music');
  assert.match(read('site/js/main.js'), /e\.data\?\.type === 'go'[\s\S]{0,120}router\.go\(/);
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
