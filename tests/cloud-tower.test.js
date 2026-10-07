/**
 * The cloud tower (deploy/cloud/) — what must hold before Ortis pastes a
 * script into Oracle and waits ten minutes to find out:
 *   - the scripts parse, and every setting install.sh writes is one the
 *     server actually reads (a typo there is a silent default in production);
 *   - no real station key is ever committed;
 *   - the site builds tuned to its own server, and the server serves it:
 *     every route a page, an unknown path the site's 404, /api untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLOUD = path.join(ROOT, 'deploy', 'cloud');
const run = promisify(execFile);

test('the cloud scripts parse, and first-boot.sh carries no real key', () => {
  for (const f of ['install.sh', 'update.sh', 'first-boot.sh']) {
    execFileSync('bash', ['-n', path.join(CLOUD, f)]);
  }
  const fb = fs.readFileSync(path.join(CLOUD, 'first-boot.sh'), 'utf8');
  assert.match(fb, /TOWER_KEY='PUT-A-LONG-RANDOM-KEY-HERE'/, 'the committed template keeps its placeholder');
  assert.match(fb, /deploy\/cloud\/install\.sh/);
});

test('every setting install.sh writes is one the server reads', () => {
  const install = fs.readFileSync(path.join(CLOUD, 'install.sh'), 'utf8');
  const block = install.match(/cat > \/etc\/radio-tower\.env <<EOF\n([\s\S]*?)\nEOF/)[1];
  const keys = block.split('\n').map((l) => l.split('=')[0]).filter(Boolean);
  const config = fs.readFileSync(path.join(ROOT, 'server', 'config.js'), 'utf8');
  for (const k of keys) {
    if (k === 'NODE_ENV') continue;
    assert.ok(config.includes(`'${k}'`) || config.includes(`env.${k}`), `${k} is written by install.sh but server/config.js never reads it`);
  }
  assert.ok(keys.includes('SITE_DIR') && keys.includes('ALLOW_UPLOADS') && keys.includes('STATION_KEY'));
  assert.match(install, /iptables -I INPUT 1 -p tcp --dport "\$p"/, 'ports 80/443 opened before Oracle\'s REJECT rule');
});

let hasFfmpeg = true;
try { await run('ffmpeg', ['-version']); } catch { hasFfmpeg = false; }

test('the tower serves the whole site, tuned to itself', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const dist = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-dist-tower-'));
  const music = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-cloud-music-'));
  for (const [rel, s, f] of [['Haze/a.mp3', 3, 220], ['Haze/b.mp3', 4, 260], ['Haze/c.mp3', 3, 300], ['Zone/d.mp3', 5, 330], ['Zone/e.mp3', 3, 370], ['Zone/f.mp3', 4, 410]]) {
    await fsp.mkdir(path.dirname(path.join(music, rel)), { recursive: true });
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${s}`, '-metadata', `title=${rel}`, '-b:a', '64k', path.join(music, rel)]);
  }
  const { build } = await import('../scripts/site-build.mjs');
  await build({ tower: '', dist, quiet: true, repo: '' });
  const cfg = JSON.parse(await fsp.readFile(path.join(dist, 'config.json'), 'utf8'));
  assert.equal(cfg.mode, 'tower');
  assert.equal(cfg.tower.url, '', 'same origin');

  Object.assign(process.env, { MUSIC_DIR: music, CACHE_FILE: path.join(music, '.cache', 'l.json'), SITE_DIR: dist, AUTO_RESCAN_MINUTES: '0' });
  const { createApp, rescan } = await import('../server/index.js');
  await rescan({ useCache: false });
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const p of ['/', '/radio', '/booth', '/atlas']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 200, p);
      assert.match(await r.text(), /<base href="\/">/, `${p} is the site's shell`);
    }
    const missing = await fetch(`${base}/no/such/page`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /<base href="\/">/, 'the site\'s own 404 page');
    const api = await fetch(`${base}/api/nope`);
    assert.equal((await api.json()).error, 'not_found', '/api keeps its JSON errors');
    const ch = await (await fetch(`${base}/api/channels`)).json();
    assert.deepEqual(ch.channels.map((c) => c.slug), ['mashup', 'crate-haze', 'crate-zone', 'all']);
    assert.equal((await fetch(`${base}/config.json`)).headers.get('cache-control'), 'no-cache');
  } finally {
    server.close();
  }
});
