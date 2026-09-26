import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { walk, trackId, resolveTrackPath } from '../server/lib/library.js';

async function tmpTree() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-lib-'));
  await fs.mkdir(path.join(dir, 'Albums', 'One'), { recursive: true });
  await fs.mkdir(path.join(dir, '.hidden'), { recursive: true });
  await fs.writeFile(path.join(dir, 'a.mp3'), 'x');
  await fs.writeFile(path.join(dir, 'notes.txt'), 'x');
  await fs.writeFile(path.join(dir, 'Albums', 'b.FLAC'), 'x');
  await fs.writeFile(path.join(dir, 'Albums', 'One', 'c.m4a'), 'x');
  await fs.writeFile(path.join(dir, '.hidden', 'sneaky.mp3'), 'x');
  await fs.writeFile(path.join(dir, '.dotfile.mp3'), 'x');
  return dir;
}

test('walk finds audio recursively and ignores everything else', async () => {
  const dir = await tmpTree();
  const found = (await walk(dir)).map((f) => path.relative(dir, f).split(path.sep).join('/')).sort();
  assert.deepEqual(found, ['Albums/One/c.m4a', 'Albums/b.FLAC', 'a.mp3'].sort());
  await fs.rm(dir, { recursive: true, force: true });
});

test('walk survives a missing directory instead of throwing', async () => {
  assert.deepEqual(await walk('/definitely/not/here'), []);
});

test('track ids are stable across runs and unique per path', () => {
  assert.equal(trackId('Albums/One/c.m4a'), trackId('Albums/One/c.m4a'));
  assert.notEqual(trackId('a.mp3'), trackId('b.mp3'));
  assert.match(trackId('a.mp3'), /^[0-9a-f]{12}$/);
});

test('resolveTrackPath refuses paths that escape the music directory', async () => {
  const dir = await tmpTree();
  assert.throws(
    () => resolveTrackPath({ relPath: '../../../etc/passwd' }, dir),
    /escapes music directory/,
  );
  assert.throws(() => resolveTrackPath({ relPath: 'nope.mp3' }, dir), /missing file/);
  assert.equal(resolveTrackPath({ relPath: 'a.mp3' }, dir), path.join(dir, 'a.mp3'));
  await fs.rm(dir, { recursive: true, force: true });
});
