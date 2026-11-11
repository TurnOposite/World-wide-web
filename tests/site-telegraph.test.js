/**
 * The listener's end of the telegraph line (site/js/ui/telegraph.js), the
 * icon bank (scripts/site-telegraph.mjs) and the Antenna that holds them.
 *
 *   - who a listener is lasts the visit; the browser keeps it only when asked,
 *     and leaving forgets it;
 *   - the page shows each message once, in order, without those taken off;
 *   - a stranger's text never becomes markup: the module builds with
 *     textContent, and has no innerHTML fed from a message;
 *   - the bank is the folder: only pictures, only names a message may carry,
 *     nothing too heavy — and the list kept in git names files that exist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { identity, validIdentity, mergeMessages, initial, IDENTITY_KEY, KEEP } from '../site/js/ui/telegraph.js';
import { iconBank, labelOf, manifest, DIR, OUT, MAX_BYTES, NAME } from '../scripts/site-telegraph.mjs';
import { cleanIcon } from '../server/lib/telegraph.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test('who a listener is: a real name, an icon that is a plain file name or none', () => {
  assert.deepEqual(validIdentity({ name: '  Night   owl ', icon: '03-moon.svg' }), { name: 'Night owl', icon: '03-moon.svg' });
  assert.deepEqual(validIdentity({ name: 'A', icon: '../../x.png' }), { name: 'A', icon: null });
  assert.equal(validIdentity({ name: '   ' }), null);
  assert.equal(validIdentity({ name: 'x'.repeat(25) }), null, 'the tower\'s limit');
  assert.equal(validIdentity(null), null);
  assert.equal(validIdentity('Ada'), null);
  assert.equal(initial('  éa'), 'É');
  assert.equal(initial(''), '?');
});

test('whoever shows the listener (the mini-player) is told when they join, change or leave', () => {
  const s = store();
  const heard = [];
  const stop = identity.on((me) => heard.push(me && `${me.name}/${me.icon}`));
  identity.set({ name: 'Ada', icon: 'cast.operator.2' }, {}, s);
  identity.set({ name: 'Ada', icon: 'cast.relay.0' }, {}, s);
  assert.equal(identity.set({ name: '   ' }, {}, s), null, 'a name that is not one changes nothing');
  identity.leave(s);
  stop();
  identity.set({ name: 'Bo', icon: null }, {}, s);
  identity.leave(s);
  assert.deepEqual(heard, ['Ada/cast.operator.2', 'Ada/cast.relay.0', null]);
});

test('the browser keeps a listener only when asked, and leaving forgets them', () => {
  const s = store();
  identity._me = null; identity._read = false;
  assert.equal(identity.get(s), null);
  // Ortis, 2026-11-10: « let people decide if they want to save that info ».
  assert.deepEqual(identity.set({ name: 'Ada', icon: '01-wave.svg' }, {}, s), { name: 'Ada', icon: '01-wave.svg', kept: false });
  assert.equal(s.m.size, 0, 'not ticked: nothing is written');
  assert.equal(identity.get(s).name, 'Ada', 'yet they are on the line for the visit');
  identity.set({ name: 'Ada', icon: '01-wave.svg' }, { remember: true }, s);
  assert.deepEqual(JSON.parse(s.getItem(IDENTITY_KEY)), { name: 'Ada', icon: '01-wave.svg' }, 'ticked: the name and the icon, nothing else');
  identity._me = null; identity._read = false; // a new visit
  assert.deepEqual(identity.get(s), { name: 'Ada', icon: '01-wave.svg', kept: true });
  identity.set({ name: 'Ada', icon: null }, { remember: false }, s);
  assert.equal(s.m.size, 0, 'unticking forgets what was kept');
  identity.set({ name: 'Ada' }, { remember: true }, s);
  identity.leave(s);
  assert.equal(s.m.size, 0);
  assert.equal(identity.get(s), null);
  assert.equal(identity.set({ name: '' }, { remember: true }, s), null, 'no name, no one');
  // Storage that is broken or holds something else is no listener — and never a crash.
  identity._me = null; identity._read = false;
  assert.equal(identity.get({ getItem: () => '{"name":""}' }), null);
  identity._read = false;
  assert.equal(identity.get({ getItem: () => { throw new Error('denied'); } }), null);
  identity._me = null; identity._read = false;
});

test('the page shows each message once, in order, without those taken off, and only so many', () => {
  const m = (id) => ({ id, text: `m${id}` });
  assert.deepEqual(mergeMessages([m(1), m(2)], [m(2), m(3)]).map((x) => x.id), [1, 2, 3]);
  assert.deepEqual(mergeMessages([m(3), m(1)], [m(2)], [1]).map((x) => x.id), [2, 3]);
  assert.deepEqual(mergeMessages([], [m(5), null, { text: 'no id' }]).map((x) => x.id), [5]);
  const many = Array.from({ length: KEEP + 30 }, (_, i) => m(i + 1));
  assert.equal(mergeMessages(many, []).length, KEEP);
  assert.equal(mergeMessages(many, [])[0].id, 31, 'the oldest go');
});

test('a stranger\'s text is put on the page as text, never as markup or a link', () => {
  const src = read('site/js/ui/telegraph.js');
  const html = [...src.matchAll(/innerHTML\s*=\s*`([\s\S]*?)`/g)].map((x) => x[1]);
  assert.equal(html.length, 1, 'one innerHTML: the empty frame of the line');
  assert.doesNotMatch(html[0], /\$\{/, '…with nothing interpolated into it');
  assert.doesNotMatch(src, /insertAdjacentHTML|outerHTML|document\.write/);
  assert.doesNotMatch(src, /createElement\(['"]a['"]\)|\.href\s*=\s*m\./, 'nothing in a message becomes a link');
  assert.match(src, /h\('p', 'tg-text', m\.text\)/, 'the text goes through textContent');
});

test('the icon bank is the folder: pictures only, names a message may carry, nothing too heavy', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-icons-'));
  const put = (name, bytes = 10) => fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes, 1));
  put('02-blue_cat.png'); put('10-last.webp'); put('01-first.SVG'); put('my photo.jpg'); put('notes.txt'); put('README.md');
  put('huge.png', MAX_BYTES + 1); put('heavy.jpg', 80 * 1024); fs.mkdirSync(path.join(dir, 'sub.png'));
  const bank = iconBank(dir);
  assert.deepEqual(bank.icons.map((i) => i.file), ['01-first.SVG', '02-blue_cat.png', '10-last.webp', 'heavy.jpg'], 'in the order of their names (1, 2, 10)');
  assert.deepEqual(bank.icons[1], { file: '02-blue_cat.png', label: 'blue cat' });
  assert.deepEqual(bank.left.map((l) => l.file).sort(), ['huge.png', 'my photo.jpg', 'notes.txt'], 'left out, and named: a space in the name, not a picture, too heavy');
  assert.deepEqual(bank.heavy, ['heavy.jpg'], 'kept, with a warning');
  assert.deepEqual(iconBank(path.join(dir, 'nowhere')), { icons: [], left: [], heavy: [] }, 'no folder is an empty bank, not a failed build');
  assert.equal(labelOf('07.png'), '07');
  for (const i of bank.icons) assert.equal(cleanIcon(i.file), i.file, `${i.file}: every icon of the bank is one the tower lets a message carry`);
  assert.equal(NAME.test('a b.png'), false);
});

test('the list kept in git names files that are in the folder, and the build makes it again', () => {
  const kept = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.ok(kept.icons.length >= 1, 'a line with no icon to pick is still a line, but the site ships some');
  for (const i of kept.icons) assert.ok(fs.existsSync(path.join(DIR, i.file)), i.file);
  assert.equal(fs.readFileSync(OUT, 'utf8'), manifest(iconBank()), 'site/data/telegraph.json is what the folder holds today (node scripts/site-telegraph.mjs)');
  assert.match(read('scripts/site-build.mjs'), /'site-telegraph\.mjs'/, 'every build lists the folder again: dropping pictures in is the whole procedure');
});

test('the Antenna holds the dial and the line; /radio leads to it; the phone trims /radio', () => {
  const antenna = read('site/js/pages/antenna.js');
  assert.match(antenna, /new ChannelDial\(/);
  assert.match(antenna, /new TelegraphLine\(/);
  assert.doesNotMatch(antenna, /mapSvg|world-map/, 'no map in it: the Atlas is Echo\'s');
  assert.ok(!fs.existsSync(path.join(ROOT, 'site/js/pages/broadcast.js')), 'Zone\'s Atlas is gone, not left beside it');
  const radio = read('site/js/pages/radio.js');
  assert.doesNotMatch(radio, /ChannelDial/, 'the dial is the Antenna\'s');
  assert.match(radio, /id="rStream" href="antenna"/);
  assert.equal((radio.match(/radio-extra/g) || []).length >= 4, true);
  const css = read('site/css/site.css');
  assert.match(css, /@media \(max-width:760px\),\(max-height:500px\)\{\s*\.radio-extra\{display:none!important\}/, 'at the world\'s own phone breakpoints');
  const booth = read('site/js/pages/booth.js');
  assert.match(booth, /id="bBig">Visuals on the big screen</);
  assert.doesNotMatch(booth, /<span class="kbd">F<\/span> full screen/, 'a button, not « press F »');
});
