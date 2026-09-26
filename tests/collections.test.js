/**
 * The Library / Photos / Crates rooms: GET /api/collections and the files it
 * points at under /collections/.
 *
 * The risk here is publishing. These pages sit on a public tunnel next to a
 * folder that also holds private working material (`_review/` contact sheets
 * of personal photos, `_incoming/` staging), so most of these tests are about
 * what must NOT be served: underscore folders, dotfiles, anything outside the
 * allowed file types, and path traversal. The rest pin the degradation rule:
 * a manifest entry whose file is missing disappears from the page instead of
 * becoming a broken link, and a missing or broken manifest is an empty room,
 * never a 500.
 *
 * Runs against a scratch COLLECTIONS_DIR, so it needs nothing but Node.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http, { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-collections-'));
process.env.COLLECTIONS_DIR = DIR;
process.env.MUSIC_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-col-music-'));
process.env.CACHE_FILE = path.join(process.env.MUSIC_DIR, '.cache', 'library.json');

// A tiny but real PDF and PNG, so content types and ranges are genuine.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

async function put(rel, data) {
  const abs = path.join(DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

await put('university/essays/real.pdf', PDF);
await put('university/covers/real.jpg', PNG);
await put('university/maps/map.png', PNG);
await put('photos/a/one.jpg', PNG);
await put('_review/private-contact-sheet.jpg', PNG);
await put('_incoming/staged.pdf', PDF);
await put('.hidden.pdf', PDF);
await put('notes.txt', 'not servable');

const manifest = {
  university: {
    title: 'The Library',
    shelves: [
      {
        id: 'mcgill',
        label: 'McGill',
        books: [
          { id: 'real', title: 'A Real Essay', course: 'POLI 101', kind: 'Paper', file: 'university/essays/real.pdf', cover: 'university/covers/real.jpg', pages: 3 },
          { id: 'ghost', title: 'Not Copied Yet', course: 'POLI 102', kind: 'Paper', file: 'university/essays/ghost.pdf' },
          { id: 'sneaky', title: 'Escape', course: 'X', kind: 'Paper', file: '../../etc/passwd' },
          { id: 'private', title: 'Private', course: 'X', kind: 'Paper', file: '_incoming/staged.pdf' },
          { id: 'maps', title: 'The maps', course: 'SNA', kind: 'Maps', mapsLink: true },
        ],
      },
    ],
    maps: { layers: [{ id: 'm', title: 'Map', source: 'Fig 1', file: 'university/maps/map.png', legend: [{ label: 'A', share: 60, color: '#f00' }] }] },
  },
  photos: { albums: [{ id: 'a', title: 'A', items: [{ file: 'photos/a/one.jpg', w: 4, h: 3, caption: 'one' }, { file: 'photos/a/missing.jpg' }] }] },
  music: { crates: [{ id: 'c', match: { album: 'X' }, cover: 'music/covers/none.jpg', note: 'n' }] },
};
await put('collection.json', JSON.stringify(manifest));

const { createApp } = await import('../server/index.js');
const server = createServer(createApp());
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const getJson = async (url) => (await fetch(base + url)).json();

/** Raw node:http so the path reaches the server exactly as written (fetch normalises ../). */
function rawGet(p, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + '/', { path: p, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the manifest is served with paths turned into /collections/ URLs', async () => {
  const data = await getJson('/api/collections');
  assert.equal(data.ok, true);
  const books = data.university.shelves[0].books;
  const real = books.find((b) => b.id === 'real');
  assert.equal(real.file.url, '/collections/university/essays/real.pdf');
  assert.equal(real.file.bytes, PDF.length);
  assert.equal(real.cover, '/collections/university/covers/real.jpg');
  assert.equal(data.university.maps.layers[0].url, '/collections/university/maps/map.png');
  assert.equal(data.photos.albums[0].items[0].thumb, '/collections/photos/a/one.jpg', 'no thumb listed → the full image stands in');
});

test('entries whose file is missing, private, or outside the folder are hidden, not broken links', async () => {
  const data = await getJson('/api/collections');
  const ids = data.university.shelves[0].books.map((b) => b.id);
  assert.deepEqual(ids, ['real', 'maps'], 'ghost (missing), sneaky (traversal) and private (_incoming) must all be dropped');
  assert.equal(data.photos.albums[0].items.length, 1);
  assert.equal(data.music.crates[0].cover, null, 'a missing crate cover is null, not a dead URL');
  assert.ok(data.missing.length >= 4, 'what was hidden is reported so the curator can fix the manifest');
});

test('a listed PDF is served inline, and as a download with ?download=1', async () => {
  const inline = await fetch(base + '/collections/university/essays/real.pdf');
  assert.equal(inline.status, 200);
  assert.match(inline.headers.get('content-type'), /application\/pdf/);
  assert.equal(inline.headers.get('content-disposition'), null);
  assert.match(inline.headers.get('cache-control'), /max-age=86400/);

  const dl = await fetch(base + '/collections/university/essays/real.pdf?download=1');
  assert.match(dl.headers.get('content-disposition') ?? '', /attachment; filename="real\.pdf"/);
});

test('range requests work, so a phone can open page 1 of a long PDF without the whole file', async () => {
  const r = await rawGet('/collections/university/essays/real.pdf', { Range: 'bytes=0-7' });
  assert.equal(r.status, 206);
  assert.equal(r.body.toString(), '%PDF-1.4');
});

for (const [what, p] of [
  ['an underscore working folder (_review)', '/collections/_review/private-contact-sheet.jpg'],
  ['an underscore working folder (_incoming)', '/collections/_incoming/staged.pdf'],
  ['a dotfile', '/collections/.hidden.pdf'],
  ['the manifest itself', '/collections/collection.json'],
  ['a file type outside the allow-list', '/collections/notes.txt'],
  ['an encoded traversal', '/collections/..%2f..%2fpackage.json'],
  ['a double-encoded traversal', '/collections/%2e%2e/%2e%2e/package.json'],
  ['a directory', '/collections/university/'],
]) {
  test(`never serves ${what}`, async () => {
    const r = await rawGet(p);
    assert.equal(r.status, 404, `${p} answered ${r.status}`);
  });
}

test('a broken manifest is an empty room with a reason, not a 500', async () => {
  const file = path.join(DIR, 'collection.json');
  const good = await fs.readFile(file, 'utf8');
  try {
    await fs.writeFile(file, '{ this is not json');
    // mtime granularity: make sure the change is seen as a change.
    const later = new Date(Date.now() + 5000);
    await fs.utimes(file, later, later);
    const res = await fetch(base + '/api/collections');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.match(data.reason, /not valid JSON/);
    assert.deepEqual(data.university.shelves, []);
  } finally {
    await fs.writeFile(file, good);
    const later = new Date(Date.now() + 10000);
    await fs.utimes(file, later, later);
  }
  const back = await getJson('/api/collections');
  assert.equal(back.ok, true, 'fixing the file is picked up without a restart');
});

test('the three rooms are reachable from every page through the section bar', async () => {
  for (const page of ['/', '/schedule.html', '/library.html', '/photos.html', '/crates.html']) {
    const html = await (await fetch(base + page)).text();
    for (const href of ['/library.html', '/photos.html', '/crates.html', '/schedule.html']) {
      assert.ok(html.includes(`href="${href}"`), `${page} has no link to ${href}`);
    }
    assert.match(html, /<script src="\/sitenav\.js" type="module"><\/script>/);
  }
});

test('the manifest shipped in the repo parses and every file it lists is present', { skip: !(await fs.stat(path.join(ROOT, 'collections', 'university')).catch(() => null)) && 'collections/ not present on this machine' }, async () => {
  const { Collections } = await import('../server/lib/collections.js');
  const view = await new Collections({ dir: path.join(ROOT, 'collections') }).load();
  assert.equal(view.ok, true, view.reason);
  assert.deepEqual(view.missing, [], `the shipped manifest points at missing files: ${JSON.stringify(view.missing)}`);
  const books = view.university.shelves.flatMap((s) => s.books);
  assert.ok(books.some((b) => b.featured && b.file), 'the thesis must be on the shelf with a downloadable file');
  assert.ok(view.university.maps.layers.length >= 1, 'the map room must have at least one map');
});
