/**
 * pi/anywhere/ — the kit that lets the tower come online by itself wherever
 * it is plugged in: the online settings file, the setup portal (join any
 * Wi-Fi from a phone), the tunnel launcher and the watchdog.
 *
 * Same method as tests/pi-wifi.test.js: there is no Pi and no radio here, so
 * every script is driven in --dry-run or against stub binaries (a fake curl,
 * nmcli, iw, cloudflared) placed first on PATH or passed by env. That covers
 * the parsing and the decisions, which is where the risk lives. It cannot
 * prove that nmcli brings a hotspot up on real hardware or that a phone pops
 * the captive page — pi/anywhere/README.md says so rather than pretending.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const K = path.join(ROOT, 'pi', 'anywhere');
const NETWORK = path.join(ROOT, 'pi', 'wifi', 'radiotower-network.sh');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-anywhere-'));
const TOKEN = 'eyJhIjoiYWJjZGVmIiwidCI6IjEyMzQ1Njc4LTkwIiwicyI6Ik1USXpORFUyIn0';

let n = 0;
const tmp = (name) => path.join(scratch, `${++n}-${name}`);

async function sh(script, args, env = {}) {
  try {
    const { stdout, stderr } = await run('bash', [script, ...args], { env: { ...process.env, ...env } });
    return { code: 0, out: stdout, err: stderr };
  } catch (e) {
    return { code: e.code ?? 1, out: e.stdout ?? '', err: e.stderr ?? '' };
  }
}

async function stub(name, body) {
  const file = tmp(name);
  await fs.writeFile(file, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  return file;
}

// ------------------------------------------------------ radiotower-online --

async function online(contents, { env = {}, args = ['--dry-run'] } = {}) {
  const cfg = tmp('radiotower-online.txt');
  if (contents !== null) await fs.writeFile(cfg, contents);
  return sh(path.join(K, 'radiotower-online.sh'), args, {
    RT_ONLINE_CONFIG: cfg, RT_ONLINE_ENV: env.RT_ONLINE_ENV ?? tmp('online.env'), RT_SYSTEMCTL: 'true', ...env,
  });
}

test('online: a domain and token written in Notepad (CRLF, pasted URL) become domain mode', async () => {
  const r = await online(`DOMAIN = https://radio.example.com/\r\nTUNNEL_TOKEN = ${TOKEN}\r\n`);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /go public on radio\.example\.com/);
  assert.match(r.out, /PLAN: RT_MODE=domain/);
  assert.match(r.out, /PLAN: RT_DOMAIN=radio\.example\.com$/m, 'the URL must be reduced to a hostname, with no \\r');
  assert.doesNotMatch(r.out, new RegExp(TOKEN), 'the token must never be printed in full');
});

test('online: pasting the whole "cloudflared service install <token>" line still works', async () => {
  const r = await online(`TUNNEL_TOKEN = sudo cloudflared service install ${TOKEN}\n`);
  assert.match(r.out, /PLAN: RT_MODE=domain/);
});

test('online: something that is not a tunnel token is refused, and the tower stays local', async () => {
  const r = await online('TUNNEL_TOKEN = my-cloudflare-password\n');
  assert.match(r.err, /does not look like a Cloudflare tunnel token/);
  assert.match(r.out, /PLAN: RT_MODE=local/);
});

test('online: a setup-hotspot password WPA would reject falls back to the default', async () => {
  const r = await online('SETUP_HOTSPOT = My Setup | short\n');
  assert.match(r.err, /8–63 characters/);
  assert.match(r.out, /"My Setup"/, 'the name is kept even when the password is not');
});

test('online: deleting the token line keeps the token; an empty token line clears it', async () => {
  const envFile = tmp('online.env');
  const env = { RT_ONLINE_ENV: envFile };
  await online(`DOMAIN = radio.example.com\nTUNNEL_TOKEN = ${TOKEN}\n`, { env, args: [] });
  const written = await fs.readFile(envFile, 'utf8');
  assert.match(written, /RT_MODE=domain/);
  assert.equal((fssync.statSync(envFile).mode & 0o777).toString(8), '600', 'the token file must be root-only');

  await online('DOMAIN = radio.example.com\n', { env, args: [] });
  assert.match(await fs.readFile(envFile, 'utf8'), /RT_MODE=domain/, 'removing the line from the FAT32 card must not take the tower offline');

  await online('TUNNEL_TOKEN =\n', { env, args: [] });
  assert.match(await fs.readFile(envFile, 'utf8'), /RT_MODE=local/, 'an explicitly empty token turns the tunnel off');
});

test('online: no file on the card and nothing known yet → local mode with the default setup hotspot', async () => {
  const r = await online(null);
  assert.equal(r.code, 0);
  assert.match(r.out, /"Radio Tower Setup"/);
  assert.match(r.out, /PLAN: RT_MODE=local/);
});

test('online: the example file we ship parses without a single complaint', async () => {
  const r = await online(await fs.readFile(path.join(K, 'radiotower-online.txt.example'), 'utf8'));
  assert.equal(r.code, 0);
  assert.equal(r.err.trim(), '', `the example must not contain lines the parser rejects: ${r.err}`);
});

// ------------------------------------------------------ radiotower-tunnel --

async function tunnel(envText, helpText) {
  const envFile = tmp('online.env');
  await fs.writeFile(envFile, envText);
  const cf = await stub('cloudflared', `echo "${helpText}"`);
  return sh(path.join(K, 'radiotower-tunnel.sh'), ['--dry-run'], { RT_ONLINE_ENV: envFile, RT_CLOUDFLARED: cf, RT_TOKEN_FILE: tmp('tok') });
}

test('tunnel: prefers --token-file so the token never appears in `ps`', async () => {
  const r = await tunnel(`RT_MODE=domain\nTUNNEL_TOKEN=${TOKEN}\nRT_DOMAIN=radio.example.com\n`, '--token-file value  --token value');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /PLAN: .*tunnel --no-autoupdate --metrics 127\.0\.0\.1:20241 run --token-file/);
  assert.doesNotMatch(r.out, /eyJ/);
});

test('tunnel: falls back to --token on an old cloudflared, and still masks it in output', async () => {
  const r = await tunnel(`RT_MODE=domain\nTUNNEL_TOKEN=${TOKEN}\n`, 'usage: run [--token value]');
  assert.match(r.out, /run --token <token>/);
});

test('tunnel: no token → exits cleanly and says the station stays local', async () => {
  const r = await tunnel('RT_MODE=local\nTUNNEL_TOKEN=\n', '');
  assert.equal(r.code, 0, 'exit 0 so Restart=on-failure leaves the unit quietly down');
  assert.match(r.out, /staying on the local network/);
  assert.doesNotMatch(r.out, /PLAN:/);
});

// ------------------------------------ radiotower-network: the new fallback --

async function network(wifiFile, { onlineEnv = '', args = ['--dry-run'], offline = true } = {}) {
  const cfg = tmp('radiotower-wifi.txt');
  if (wifiFile !== null) await fs.writeFile(cfg, wifiFile);
  const envFile = tmp('online.env');
  await fs.writeFile(envFile, onlineEnv);
  return sh(NETWORK, args, {
    RT_WIFI_CONFIG: cfg, RT_ONLINE_ENV: envFile, RT_NMCLI: 'nmcli-should-not-run',
    RT_ASSUME_OFFLINE: offline ? '1' : '0', RT_SCAN_FILE: tmp('scan.txt'), RT_JOIN_RESULT: tmp('join.txt'),
  });
}

test('network: nothing known in range and no Ethernet → scan, then the setup hotspot and portal', async () => {
  const r = await network(null);
  assert.equal(r.code, 0, r.err);
  const scanAt = r.out.indexOf('scan nearby networks');
  const apAt = r.out.indexOf('device wifi hotspot');
  assert.ok(scanAt > -1 && apAt > -1, r.out);
  assert.ok(scanAt < apAt, 'the scan must happen BEFORE the radio becomes an access point, or the portal has no list');
  assert.match(r.out, /device wifi hotspot ifname wlan0 con-name rt-hotspot ssid Radio Tower Setup password radiotower/);
  assert.match(r.out, /PLAN: \S*systemctl start radiotower-portal\.service/);
});

test('network: the setup hotspot name and password come from radiotower-online.txt', async () => {
  const r = await network('Home | pass1234\n', { onlineEnv: "RT_SETUP_SSID='Ortis Tower'\nRT_SETUP_PASS=longenough\n" });
  assert.match(r.out, /ssid Ortis Tower password longenough/);
});

test('network: a HOTSPOT line (broadcast the station) still wins over the setup hotspot', async () => {
  const r = await network('Home | pass1234\nHOTSPOT = Radio Tower | towerpassword\n');
  assert.match(r.out, /ssid Radio Tower password towerpassword/);
  assert.doesNotMatch(r.out, /Radio Tower Setup/);
});

test('network: on a connected tower (Ethernet, or a known Wi-Fi) no hotspot is planned', async () => {
  const r = await network(null, { offline: false });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /hotspot/);
});

test('network: --after-portal leaves the hotspot first, and records a failed join for the page', async () => {
  const r = await network('Cafe Wifi | password9\n', { args: ['--dry-run', '--after-portal'] });
  const downAt = r.out.indexOf('connection down rt-hotspot');
  assert.ok(downAt > -1, 'the radio must stop being an access point before it can join anything');
  assert.ok(downAt < r.out.indexOf('connection add type wifi'));
  assert.match(r.out, /record "could not join Cafe Wifi/);
});

// ------------------------------------------------------------ the portal --

const portal = await import(pathToFileURL(path.join(K, 'portal.mjs')).href);

test('portal: nmcli scan output → strongest first, deduped, escaped colons handled', () => {
  const list = portal.parseScan('Home:40:WPA2\nHome:82:WPA2\nCafe\\:Free:60:\n--:30:WPA2\n:20:\nOffice:55:WPA1 WPA2\n');
  assert.deepEqual(list.map((x) => x.ssid), ['Home', 'Cafe:Free', 'Office']);
  assert.equal(list[0].signal, 82);
  assert.equal(list[1].secure, false, 'an empty security field is an open network');
});

test('portal: refuses what WPA or the Wi-Fi file format cannot hold', () => {
  assert.equal(portal.validate('Home', 'goodpassword'), null);
  assert.equal(portal.validate('Open Cafe', ''), null, 'open networks are allowed');
  assert.match(portal.validate('', 'x'), /Pick a network/);
  assert.match(portal.validate('Home', 'short'), /8 to 63/);
  assert.match(portal.validate('A|B', 'goodpassword'), /\|/);
  assert.match(portal.validate('x'.repeat(33), 'goodpassword'), /32 bytes/);
});

test('portal: the chosen network goes to the top, replacing an older line for it, comments untouched', () => {
  const before = '# my notes\n# more notes\n\nOld Home | oldpass12\nCafe | cafepass1\nHOTSPOT = Radio Tower | towerpassword\n';
  const after = portal.upsertNetwork(before, 'Cafe', 'newpass12');
  const lines = after.trim().split('\n');
  assert.equal(lines[0], '# my notes');
  assert.equal(lines.filter((l) => l.startsWith('Cafe')).length, 1, 'no duplicate lines for the same network');
  assert.equal(lines.find((l) => !l.startsWith('#') && l.trim()), 'Cafe | newpass12', 'the new choice is the first network listed');
  assert.ok(lines.includes('Old Home | oldpass12'));
  assert.ok(lines.includes('HOTSPOT = Radio Tower | towerpassword'), 'the HOTSPOT line is not a network and must survive');
});

test('portal: end to end over HTTP — list, captive probe, bad input, good input launches the join', async () => {
  const wifi = tmp('radiotower-wifi.txt');
  await fs.writeFile(wifi, '# notes\nHome | homepass1\n');
  const scan = tmp('scan.txt');
  await fs.writeFile(scan, 'Hotel Guest:71:WPA2\nHome:30:WPA2\n');
  const marker = tmp('joined');
  const joinCmd = await stub('join', `echo "$@" > "${marker}"`);
  Object.assign(process.env, { RT_WIFI_CONFIG: wifi, RT_SCAN_FILE: scan, RT_JOIN_CMD: `${joinCmd} --after-portal` });
  const fresh = await import(`${pathToFileURL(path.join(K, 'portal.mjs')).href}?e2e`);
  const server = fresh.createPortal();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await (await fetch(base + '/')).text();
    assert.match(home, /Hotel Guest/);
    assert.match(home, /Listen to the tower/);

    const probe = await fetch(base + '/generate_204', { redirect: 'manual' });
    assert.equal(probe.status, 302, 'captive-portal probes must NOT get the answer the phone expects');

    const bad = await fetch(base + '/join', { method: 'POST', body: new URLSearchParams({ ssid: 'Hotel Guest', password: 'short' }) });
    assert.equal(bad.status, 400);
    assert.match(await fs.readFile(wifi, 'utf8'), /^# notes\nHome \| homepass1\n$/, 'a rejected form must not touch the file');

    const good = await fetch(base + '/join', { method: 'POST', body: new URLSearchParams({ ssid: 'Hotel Guest', password: 'room4242pw' }) });
    assert.equal(good.status, 200);
    assert.match(await good.text(), /Joining “Hotel Guest”/);
    assert.match(await fs.readFile(wifi, 'utf8'), /^# notes\nHotel Guest \| room4242pw\nHome \| homepass1\n$/);

    // The join is launched after the reply, detached.
    for (let i = 0; i < 40 && !fssync.existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(await fs.readFile(marker, 'utf8'), /--after-portal/);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------- the watchdog --

async function watchdog({ health = 0, net = 0, tunnelReady = 0, active = 'Wired connection 1:eth0', clients = 0, mode = 'local', stateDir, now = 1_000_000 } = {}) {
  const curl = await stub('curl', `for a in "$@"; do case "$a" in
    *api/health*) exit ${health} ;; *1.1.1.1*) exit ${net} ;; *20241/ready*) exit ${tunnelReady} ;; esac; done; exit 0`);
  const nmcli = await stub('nmcli', `printf '%s\\n' "${active}"`);
  const iw = await stub('iw', `for i in $(seq 1 ${clients}); do echo "Station aa:bb:cc:dd:ee:0$i (on wlan0)"; done`);
  const envFile = tmp('online.env');
  await fs.writeFile(envFile, `RT_MODE=${mode}\nRT_DOMAIN=radio.example.com\n`);
  return sh(path.join(K, 'radiotower-watchdog.sh'), ['--dry-run'], {
    RT_STATE_DIR: stateDir, RT_ONLINE_ENV: envFile, RT_CURL: curl, RT_NMCLI: nmcli, RT_IW: iw,
    RT_SYSTEMCTL: 'systemctl', RT_NETWORK_CMD: 'radiotower-network', RT_BOOT_STATUS: tmp('status.txt'), RT_NOW: String(now),
  });
}

test('watchdog: a wedged station is restarted on the third miss, not the first', async () => {
  const stateDir = tmp('state');
  const a = await watchdog({ health: 7, stateDir });
  const b = await watchdog({ health: 7, stateDir });
  assert.doesNotMatch(a.out + b.out, /PLAN: systemctl restart radiotower\.service/);
  const c = await watchdog({ health: 7, stateDir });
  assert.match(c.out, /PLAN: systemctl restart radiotower\.service/);
  const status = JSON.parse(await fs.readFile(path.join(stateDir, 'status.json'), 'utf8'));
  assert.equal(status.station, 'down');
});

test('watchdog: three minutes without internet re-runs the network script', async () => {
  const stateDir = tmp('state');
  await watchdog({ net: 7, stateDir });
  await watchdog({ net: 7, stateDir });
  const c = await watchdog({ net: 7, stateDir });
  assert.match(c.out, /PLAN: radiotower-network$/m);
});

test('watchdog: on the setup hotspot, retries known networks only when nobody is using the page', async () => {
  const busy = await watchdog({ active: 'rt-hotspot:wlan0', clients: 1, stateDir: tmp('state') });
  assert.doesNotMatch(busy.out, /--retry/, 'never pull the hotspot out from under someone typing a password');
  const idle = await watchdog({ active: 'rt-hotspot:wlan0', clients: 0, stateDir: tmp('state') });
  assert.match(idle.out, /PLAN: radiotower-network --retry/);
  assert.match(idle.out, /state: setup hotspot/);
});

test('watchdog: domain mode — internet fine but tunnel down three times → restart the tunnel', async () => {
  const stateDir = tmp('state');
  for (let i = 0; i < 2; i++) await watchdog({ mode: 'domain', tunnelReady: 7, stateDir });
  const c = await watchdog({ mode: 'domain', tunnelReady: 7, stateDir });
  assert.match(c.out, /PLAN: systemctl restart radiotower-tunnel\.service/);
  const live = await watchdog({ mode: 'domain', tunnelReady: 0, stateDir });
  assert.match(live.out, /state: live on https:\/\/radio\.example\.com/);
});

test('watchdog: writes the SD-card status file only when the state changes', async () => {
  const stateDir = tmp('state');
  const first = await watchdog({ stateDir });
  assert.match(first.out, /PLAN: write .*status\.txt/);
  const second = await watchdog({ stateDir });
  assert.doesNotMatch(second.out, /PLAN: write/, 'an SD card rewritten every minute wears out');
});

// ------------------------------------------------------- units & installer --

test('units: tunnel never gives up, portal is never enabled at boot, watchdog runs every minute', async () => {
  const unit = (f) => fs.readFile(path.join(K, 'systemd', f), 'utf8');
  const tunnelUnit = await unit('radiotower-tunnel.service');
  assert.match(tunnelUnit, /StartLimitIntervalSec=0/);
  assert.match(tunnelUnit, /Restart=on-failure/);
  assert.doesNotMatch(await unit('radiotower-portal.service'), /\[Install\]/, 'the portal must only run while a hotspot is up');
  assert.match(await unit('radiotower-watchdog.timer'), /OnUnitActiveSec=60s/);
});

test('install.sh installs and enables every piece of the kit', async () => {
  const src = await fs.readFile(path.join(ROOT, 'pi', 'install.sh'), 'utf8');
  for (const piece of ['radiotower-online', 'radiotower-tunnel', 'radiotower-watchdog', 'radiotower-portal.service', 'captive-portal.conf', 'wifi-powersave.conf', 'hardware-watchdog.conf']) {
    assert.ok(src.includes(piece), `pi/install.sh does not install ${piece}`);
  }
  assert.match(src, /systemctl enable radiotower-online\.service radiotower-tunnel\.service radiotower-watchdog\.timer/);
  assert.match(src, /--exclude 'collections\/_\*'/, 'the private collections working folders must not be copied onto the Pi');
});

test('every script in the kit parses', async () => {
  for (const f of ['radiotower-online.sh', 'radiotower-tunnel.sh', 'radiotower-watchdog.sh']) {
    await run('bash', ['-n', path.join(K, f)]);
  }
  await run(process.execPath, ['--check', path.join(K, 'portal.mjs')]);
});
