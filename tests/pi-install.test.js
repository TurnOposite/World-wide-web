/**
 * Dry-run checks for the two Pi installer scripts (`pi/install.sh`,
 * `scripts/setup-pi.sh`). Neither has ever run on real hardware — roadmap #0
 * calls `install.sh` "the highest-risk artefact in the repo", 259+ lines of
 * shell nobody had exercised. This is deliberately narrow: it proves the
 * parts that don't need root or a real Pi actually behave the way they claim
 * to, rather than leaving them completely untested.
 *
 * What this does NOT prove: everything past the root check needs either a
 * real Pi or `fakeroot` to simulate one, and even with `fakeroot`, `apt-get`,
 * `useradd`, and real systemd are structurally untestable without root or a
 * container built for it. This run did that fuller check by hand — a
 * `fakeroot` + stubbed-systemd harness that walked the *entire* script,
 * including a real `npm install` and a real running server answering a real
 * health check — see `docs/DECISIONS.md` 2026-08-18. It isn't part of this
 * permanent suite because it needs tools (`fakeroot`, real network egress,
 * ~20s runtime) this suite shouldn't have to require just to answer "is the
 * station still working?". What's here is the cheap, always-safe slice of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

let hasFakeroot = true;
try {
  await run('fakeroot', ['--version']);
} catch {
  hasFakeroot = false;
}

let hasInternet = true;
try {
  await run('curl', ['-fsS', '--max-time', '5', '-o', '/dev/null', 'https://registry.npmjs.org/']);
} catch {
  hasInternet = false;
}

for (const script of ['pi/install.sh', 'scripts/setup-pi.sh']) {
  test(`${script} refuses to run without root`, { skip: isRoot && 'this test process is already root' }, async () => {
    await assert.rejects(
      run('bash', [script], { cwd: REPO_ROOT }),
      (err) => {
        assert.match(String(err.stderr), /sudo/i, `expected a "run me with sudo" style message, got: ${err.stderr}`);
        return true;
      },
    );
  });
}

test('pi/install.sh checks network reachability over HTTP, not ICMP alone', async () => {
  // Regression guard for the 2026-08-18 fix: this sandbox itself is a real
  // example of a network that blocks outbound ICMP (`ping` fails) while
  // HTTPS works completely fine — a ping-only check false-negatived "no
  // internet" on a machine that had it, which would have hard-stopped the
  // installer. A curl-based check tests the actual capability needed.
  const src = await fs.readFile(path.join(REPO_ROOT, 'pi/install.sh'), 'utf8');
  // Specifically the functional check, not just any mention of the domain —
  // the die message's "try this yourself" hint also names registry.npmjs.org
  // and would false-pass a looser match even with no real check left.
  assert.match(
    src,
    /curl -fsS --max-time \d+ -o \/dev\/null https:\/\/registry\.npmjs\.org/,
    'expected an HTTP-based reachability check',
  );
});

test('scripts/setup-pi.sh is a thin wrapper around pi/install.sh, not a second copy of the logic', async () => {
  // 2026-08-18: these were two separate installers that had already drifted
  // (different Node-version guards, different default service user). Fixed
  // by making one delegate to the other; this guards against a future edit
  // re-introducing a parallel implementation that can drift again.
  const src = await fs.readFile(path.join(REPO_ROOT, 'scripts/setup-pi.sh'), 'utf8');
  assert.match(src, /exec bash "\$SRC_DIR\/pi\/install\.sh"/);
  assert.doesNotMatch(src, /useradd|apt-get install|systemctl (daemon-reload|enable|restart)/,
    'setup-pi.sh should not re-implement install steps that belong in pi/install.sh');
});

test('pi/install.sh: /etc paths are overridable, and the generated unit actually uses the override', async () => {
  // Without this, the script cannot be dry-run against scratch paths at all —
  // it would write straight into the real /etc no matter what a test asked
  // for. Also guards against the override existing but not being wired into
  // the systemd unit's EnvironmentFile line, which is the specific gap found
  // and fixed while building the harness this test is a cheap stand-in for.
  const src = await fs.readFile(path.join(REPO_ROOT, 'pi/install.sh'), 'utf8');
  assert.match(src, /ENV_FILE="\$\{ENV_FILE:-/);
  assert.match(src, /SYSTEMD_UNIT_PATH="\$\{SYSTEMD_UNIT_PATH:-/);
  assert.match(src, /EnvironmentFile=-\$ENV_FILE/, 'the generated unit must reference $ENV_FILE, not a hardcoded path');
});

const skipDeeper = isRoot
  ? 'this test process is already root'
  : !hasFakeroot
    ? 'fakeroot not installed — cannot simulate root for this branch'
    : !hasInternet
      ? 'no internet reachable — the script would die on the network check before reaching this one'
      : false;

test('pi/install.sh dies with the documented message when PAYLOAD_DIR is missing', { skip: skipDeeper }, async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-pi-test-'));
  try {
    await assert.rejects(
      run('fakeroot', ['env', `PAYLOAD_DIR=${scratch}/does-not-exist`, 'bash', 'pi/install.sh'], { cwd: REPO_ROOT }),
      (err) => {
        assert.match(String(err.stderr), /can't find the app at/);
        return true;
      },
    );
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('pi/install.sh dies with the documented message when PAYLOAD_DIR has no package.json', { skip: skipDeeper }, async () => {
  const payload = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-pi-test-'));
  try {
    await assert.rejects(
      run('fakeroot', ['env', `PAYLOAD_DIR=${payload}`, 'bash', 'pi/install.sh'], { cwd: REPO_ROOT }),
      (err) => {
        assert.match(String(err.stderr), /exists but has no package\.json/);
        return true;
      },
    );
  } finally {
    await fs.rm(payload, { recursive: true, force: true });
  }
});
