/**
 * Static checks over the Node version floor, pinned in three places that
 * must agree: `package.json`'s `engines.node`, `pi/install.sh`'s "is Node
 * new enough?" guard, and the self-test's own toolchain check.
 *
 * `scripts/setup-pi.sh` used to have its own copy of the same guard, and it
 * drifted (kept testing `< 20` for weeks after `pi/install.sh` moved to 22)
 * — that drift is why this file exists. As of 2026-08-18 (later, with
 * Ortis), `setup-pi.sh` is a thin wrapper around `pi/install.sh` and no
 * longer has a Node guard of its own to drift; `tests/pi-install.test.js`
 * pins *that* instead (that the wrapper delegates rather than re-implementing
 * anything). See `docs/DECISIONS.md` 2026-08-18, "Reconciling the two Pi
 * installers".
 *
 * Nothing runs these scripts — that would need a Pi, or at least a container
 * pretending to be `/boot/firmware/...` (see `tests/pi-install.test.js` for
 * what's tested with `fakeroot` instead). This is the cheap, honest slice:
 * read the files as text and prove their guards say the same number.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const read = (rel) => fs.readFile(path.join(REPO_ROOT, rel), 'utf8');

const FLOOR = 22; // Node 20 reached end of life 2026-04-30 (docs/DECISIONS.md, 2026-08-18)

test('package.json declares the Node floor as >=22', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.engines?.node, `>=${FLOOR}`);
});

test('scripts/setup-pi.sh has no Node guard of its own to drift — it delegates', async () => {
  const src = await read('scripts/setup-pi.sh');
  assert.doesNotMatch(src, /-lt\s*\d+/, 'setup-pi.sh should not re-implement the Node-version check');
  assert.match(src, /exec bash "\$SRC_DIR\/pi\/install\.sh"/);
});

test('pi/install.sh only skips installing Node when it is already >= floor', async () => {
  const src = await read('pi/install.sh');
  const match = src.match(/CUR"\s*-ge\s*(\d+)/);
  assert.ok(match, 'expected to find the "-ge <n>" version guard in pi/install.sh');
  assert.equal(Number(match[1]), FLOOR);
});

test('pi/install.sh defaults NODE_MAJOR to the same floor it installs', async () => {
  const src = await read('pi/install.sh');
  const match = src.match(/NODE_MAJOR="\$\{NODE_MAJOR:-(\d+)\}"/);
  assert.ok(match, 'expected to find NODE_MAJOR default in pi/install.sh');
  assert.equal(Number(match[1]), FLOOR);
});

test('scripts/build-test.sh fails the toolchain stage below the same floor', async () => {
  const src = await read('scripts/build-test.sh');
  const match = src.match(/"\$NODE_MAJOR"\s*-ge\s*(\d+)/);
  assert.ok(match, 'expected to find the "-ge <n>" toolchain check in build-test.sh');
  assert.equal(Number(match[1]), FLOOR);
});
