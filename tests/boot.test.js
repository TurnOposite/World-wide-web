/**
 * Boots the real production entrypoint — `node server/index.js` as an actual
 * subprocess — the one code path nothing else in this suite exercises.
 * `tests/api.test.js` imports `createApp`/`rescan` and calls `app.listen()`
 * itself, which never runs the `isMain` block at the bottom of
 * `server/index.js`. That block is exactly where the station goes on air in
 * production and on the Pi, so it needs its own coverage.
 *
 * This is what caught the 2026-08-18 regression: `isMain` compared
 * `import.meta.url` (percent-encoded) against a hand-built `file://` string
 * (not percent-encoded). Any project path needing escaping — a space, for
 * instance, like a folder literally named "Radio Tower" — made the
 * comparison silently false. The process exited 0 with no output and never
 * opened the port. `npm start` from Ortis's own machine would have done
 * exactly this.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

/**
 * How long to wait for the port to open.
 *
 * This started at 8s and went red on 2026-08-19 in a sandbox where the repo
 * sits on a mounted (9p) filesystem. The cause was measured, not guessed:
 * `node -e "await import('express'); await import('music-metadata')"` took
 * **12.0s / 13.7s / 13.3s** over the mount versus **0.20s** with the same
 * `node_modules` on local disk — a ~65x penalty on module resolution, before
 * a single line of our own code runs. The server was starting correctly the
 * whole time; it simply had not finished `import`ing by the deadline.
 *
 * Raising this does not weaken the test. The assertion is unchanged — the
 * port either opens or it does not, and a genuinely broken entrypoint (the
 * 2026-08-18 `isMain` bug this file exists to catch) exits immediately and
 * still fails here, just after a longer wait. What the old number actually
 * asserted was "boots within 8s on a fast local disk", which is a
 * performance claim this test was never meant to make — and one the Pi Zero
 * 2 W, reading `node_modules` off an SD card, might well have failed too.
 *
 * Override with BOOT_TEST_TIMEOUT_MS if you want the old tight bound.
 */
const BOOT_TIMEOUT_MS = Number(process.env.BOOT_TEST_TIMEOUT_MS) || 45_000;

test('node server/index.js — the real entrypoint — actually starts listening', async (t) => {
  t.diagnostic(`waiting up to ${BOOT_TIMEOUT_MS}ms for the port to open`);
  const musicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-boot-'));
  const port = 20000 + Math.floor(Math.random() * 5000);

  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      MUSIC_DIR: musicDir,
      CACHE_FILE: path.join(musicDir, '.cache', 'library.json'),
      PORT: String(port),
      AUTO_RESCAN_MINUTES: '0',
      STATION_NAME: 'Boot Test Tower',
    },
  });

  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (d) => { stderr += d; });
  child.stdout.on('data', (d) => { stdout += d; });

  try {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let healthy = false;
    let exited = null;
    // A dead child is a definite answer — stop waiting the full timeout for a
    // process that has already given up. This is what makes the raised
    // deadline cost nothing on a genuine failure: the isMain bug exits 0
    // within a second, and this catches that immediately.
    child.on('exit', (code, signal) => { exited = { code, signal }; });

    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        // Any HTTP answer means the entrypoint is listening, which is what
        // this test is about. `ok:false` for an empty library is expected —
        // the fixture music dir is deliberately empty.
        if (res.status > 0) { healthy = true; break; }
      } catch {
        // not listening yet — keep polling until the deadline
      }
      if (exited) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(
      healthy,
      `server never became healthy within ${BOOT_TIMEOUT_MS}ms from cwd ${REPO_ROOT}` +
        (exited ? `\n  child exited early: code=${exited.code} signal=${exited.signal}` : '') +
        (stdout ? `\n  stdout: ${stdout.trim()}` : '') +
        (stderr ? `\n  stderr: ${stderr.trim()}` : ''),
    );
  } finally {
    child.kill();
    await fs.rm(musicDir, { recursive: true, force: true });
  }
});
