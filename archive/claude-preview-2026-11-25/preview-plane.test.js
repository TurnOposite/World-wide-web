// Retired 2026-11-25 with the claude.ai preview build (LIGHTER step 3): these were in tests/cloud-control.test.js.
// Kept as text, not run (the test runner reads tests/ only).

/* ---------------------------------------------- the claude.ai preview --- */

function fakeDb({ refuse = null } = {}) {
  const store = new Map();
  const subs = new Map();
  let writes = 0;
  const snap = (p) => Object.freeze({ id: p, exists: store.has(p), data: () => (store.has(p) ? Object.freeze(JSON.parse(store.get(p))) : undefined) });
  return {
    get writes() { return writes; },
    remote(p, doc) { store.set(p, JSON.stringify(doc)); (subs.get(p) || []).forEach((fn) => fn(snap(p))); },
    doc(p) {
      if (p.split('/').length % 2) throw new TypeError('odd path');
      return {
        get: async () => snap(p),
        set: async (data) => {
          if (refuse) throw { code: refuse, message: 'no' };
          writes++;
          store.set(p, JSON.stringify(data));
          (subs.get(p) || []).forEach((fn) => fn(snap(p)));
        },
        onSnapshot(next) { subs.set(p, [...(subs.get(p) || []), next]); queueMicrotask(() => next(snap(p))); return () => {}; },
      };
    },
  };
}
const memLocal = () => {
  const mem = new Map();
  return new LocalControl({ storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }, channelName: `t-${Math.random()}` });
};
const tick = () => new Promise((r) => setTimeout(r, 5));

test('preview plane: until the database answers, it is this browser; then it is shared and live', async () => {
  let answer;
  const db = fakeDb();
  const local = memLocal();
  const plane = new ArtifactControl({ dbPromise: new Promise((r) => { answer = r; }), local });
  assert.equal(plane.kind, 'local');
  assert.equal((await plane.read()).doc.override, null, 'the radio starts without waiting');
  let heard = 0;
  plane.onChange(() => heard++);
  answer(db);
  await tick();
  assert.equal(plane.kind, 'artifact');
  const first = await plane.read();
  assert.equal(first.changed, true);

  db.remote('station/control', { version: 1, override: { cycleIndex: 3, startWithin: 2, ids: ['a', 'b'] }, look: null });
  assert.ok(heard >= 2, 'another viewer\'s write is heard without a poll');
  const next = await plane.read();
  assert.equal(next.changed, true);
  assert.deepEqual(next.doc.override.ids, ['a', 'b']);
  next.doc.override.ids.push('mutated');
  assert.equal(Object.isFrozen(next.doc), false, 'the engine gets its own copy, not the frozen snapshot');
  assert.equal((await plane.read()).changed, false, 'no news is not a change');
  local.channel?.close();
});

test('preview plane: a write goes to the shared document, and its echo is not news', async () => {
  const db = fakeDb();
  const local = memLocal();
  const plane = new ArtifactControl({ dbPromise: Promise.resolve(db), local });
  await tick();
  await plane.read();
  const doc = { version: 1, override: { cycleIndex: 1, startWithin: 2, ids: ['x', 'y'] }, look: null, updatedAt: 't' };
  await plane.write(doc);
  assert.equal(db.writes, 1);
  assert.equal((await plane.read()).changed, false);
  assert.equal((await local.read()).doc.override, null, 'nothing went to this browser\'s own copy');
  local.channel?.close();
});

test('preview plane: a viewer below Contributor gets a clear no, then a read-only booth', async () => {
  const local = memLocal();
  const plane = new ArtifactControl({ dbPromise: Promise.resolve(fakeDb({ refuse: 'invalid_argument' })), local });
  await tick();
  assert.equal(plane.writable, true, 'writable until the platform says otherwise');
  await assert.rejects(plane.write({ version: 1 }), (e) => e.code === 'view_only' && /view-only/.test(e.message));
  assert.equal(plane.writable, false);
  local.channel?.close();
});

test('preview plane: on any other host (no database) it is this browser only', async () => {
  const local = memLocal();
  const plane = new ArtifactControl({ dbPromise: Promise.resolve(null), local });
  await tick();
  assert.equal(plane.kind, 'local');
  await plane.write({ version: 1, override: null, look: { look: 'quiet' } });
  assert.deepEqual((await local.read()).doc.look, { look: 'quiet' });
  local.channel?.close();
});

test('hash routes: #/ecrits/voyages is a route, #view is an anchor', () => {
  assert.equal(routeFromHash(''), '');
  assert.equal(routeFromHash('#/'), '');
  assert.equal(routeFromHash('#/radio'), 'radio');
  assert.equal(routeFromHash('#/ecrits/voyages/'), 'ecrits/voyages');
  assert.equal(routeFromHash('#/ecrits/l%27ascenceur'), "ecrits/l'ascenceur");
  assert.equal(routeFromHash('#view'), null);
  assert.equal(routeFromHash('#book=thesis'), null);
});

test('the preview page is page content: the host adds the document around it', () => {
  const page = toArtifactPage('<!DOCTYPE html>\n<html lang="fr"><head><base href="/"><title>x</title><link rel="stylesheet" href="css/site.css"></head>\n<body>\n<main id="view"></main>\n<script type="module" src="js/main.js"></script>\n</body></html>');
  assert.ok(page.startsWith('<title>Globe Trotter</title>'));
  assert.match(page, /<link rel="stylesheet" href="css\/site.css">/);
  assert.match(page, /<script type="module" src="js\/main.js"><\/script>/);
  assert.doesNotMatch(page, /<!doctype|<html|<head|<body|<base/i);
});
