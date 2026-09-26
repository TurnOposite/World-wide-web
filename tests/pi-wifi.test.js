/**
 * `pi/wifi/radiotower-network.sh` — the script that lets the station move to a
 * new Wi-Fi network without anyone logging into it.
 *
 * The thing being protected here is a recovery path, and a recovery path that
 * only works when you can already reach the machine is worthless. There is no
 * Pi in this test run and no radio, so the script is driven in `--dry-run`,
 * where every state-changing call prints the `nmcli` command it *would* run
 * instead of running it. That makes the parser and the plan — which is where
 * all the real risk lives — fully testable on any machine with bash.
 *
 * What it cannot prove: that `nmcli` accepts these arguments on a real
 * Raspberry Pi OS, and that the hotspot actually comes up. Those are checked
 * against hardware and recorded in pi/NEW-NETWORK.md; nothing here pretends
 * otherwise (BRIEF.md rule 9).
 *
 * The CRLF test is not padding. This file is edited in Notepad on Windows, on
 * a FAT32 partition, and read by bash on Linux — a stray \r silently becomes
 * part of the Wi-Fi password, and the failure it produces ("wrong password",
 * on a password you can see is right) is close to undiagnosable in the field.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const SCRIPT = path.join(REPO_ROOT, 'pi', 'wifi', 'radiotower-network.sh');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-wifi-'));

/** Run the script in --dry-run over a config file with the given contents. */
async function plan(contents, { file = 'radiotower-wifi.txt' } = {}) {
  const configPath = path.join(scratch, `${Math.random().toString(36).slice(2)}-${file}`);
  if (contents !== null) await fs.writeFile(configPath, contents);
  try {
    const { stdout, stderr } = await run('bash', [SCRIPT, '--dry-run'], {
      env: { ...process.env, RT_WIFI_CONFIG: configPath, RT_NMCLI: 'nmcli-should-not-run' },
    });
    return { code: 0, out: stdout, err: stderr };
  } catch (e) {
    return { code: e.code ?? 1, out: e.stdout ?? '', err: e.stderr ?? '' };
  }
}

test('no config file at all leaves the network alone and exits cleanly', async () => {
  const r = await plan(null);
  assert.equal(r.code, 0, 'a tower on Ethernet has no Wi-Fi config and that is normal, not an error');
  assert.match(r.out, /no Wi-Fi config/);
  assert.doesNotMatch(r.out, /PLAN:/, 'nothing should be planned when there is nothing to apply');
});

test('an empty or comments-only config changes nothing', async () => {
  const r = await plan('# just a comment\n\n   \n');
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /PLAN: .*connection add/);
});

test('a single network becomes an autoconnecting profile with its password', async () => {
  const r = await plan('Living Room 5G | correcthorsebattery\n');
  assert.equal(r.code, 0);
  assert.match(r.out, /connection add type wifi con-name .?rt-Living Room 5G/, 'SSIDs with spaces must survive intact');
  assert.match(r.out, /ssid .?Living Room 5G/);
  assert.match(r.out, /connection\.autoconnect yes/);
  assert.match(r.out, /wifi-sec\.key-mgmt wpa-psk/);
  assert.match(r.out, /wifi-sec\.psk correcthorsebattery/);
});

test('order in the file becomes NetworkManager priority — the first line wins', async () => {
  const r = await plan('First | aaa\nSecond | bbb\nThird | ccc\n');
  const priorityOf = (ssid) => {
    const line = r.out.split('\n').find((l) => l.includes(`con-name rt-${ssid}`));
    assert.ok(line, `expected a plan line for ${ssid}`);
    return Number(line.match(/autoconnect-priority (\d+)/)[1]);
  };
  assert.ok(priorityOf('First') > priorityOf('Second'), 'the first line listed must outrank the second');
  assert.ok(priorityOf('Second') > priorityOf('Third'));
});

test('Windows line endings do not end up inside the password', async () => {
  const r = await plan('MyRouter | secretpass\r\nOther | twopass\r\n');
  assert.doesNotMatch(r.out, /\\r|\$'/, 'a \\r reaching the nmcli plan means the password is silently wrong');
  assert.match(r.out, /wifi-sec\.psk secretpass\b/);
  assert.match(r.out, /ssid MyRouter\b/);
});

test('spaces inside a password are kept; spaces around the separator are not', async () => {
  const r = await plan('Net   |   two words   \n');
  assert.match(r.out, /wifi-sec\.psk .?two words.?/, 'the password is "two words", not "  two words  "');
});

test('an open network clears the key, rather than setting an empty password', async () => {
  const r = await plan('CoffeeShopGuest |\n');
  assert.match(r.out, /con-name .?rt-CoffeeShopGuest/);
  assert.doesNotMatch(r.out, /wifi-sec\.psk/, 'an open network must not be given a PSK');
  assert.match(r.out, /wifi-sec\.key-mgmt/, 'it must actively clear key-mgmt in case the profile is being reused');
});

test('a line missing its separator is reported and skipped, and the good lines still apply', async () => {
  const r = await plan('this line has no pipe\nGood | pass\n');
  assert.equal(r.code, 0, 'one bad line must not abort the whole file');
  assert.match(r.err, /no "\|"/, 'the person editing this in Notepad needs to be told which line was wrong');
  assert.match(r.out, /con-name .?rt-Good/);
});

test('a HOTSPOT line is a fallback to create, not a network to join', async () => {
  const r = await plan('Router | pass\nHOTSPOT = Radio Tower | towerpassword\n');
  assert.doesNotMatch(r.out, /con-name .?rt-HOTSPOT/, 'the hotspot must not be added as a network to connect to');
  assert.match(r.out, /hotspot fallback/);
});

test('the shipped example file parses as valid config', async () => {
  const example = await fs.readFile(path.join(REPO_ROOT, 'pi', 'wifi', 'radiotower-wifi.txt.example'), 'utf8');
  const r = await plan(example);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.err, /ignored/, 'the example we hand people must not itself contain lines the parser rejects');
  assert.match(r.out, /con-name .?rt-Living Room 5G/);
});

test('the systemd unit runs the installed script and cannot take the station down with it', async () => {
  const unit = await fs.readFile(path.join(REPO_ROOT, 'pi', 'wifi', 'radiotower-network.service'), 'utf8');
  assert.match(unit, /ExecStart=\/usr\/local\/sbin\/radiotower-network/);
  assert.match(unit, /Type=oneshot/);
  assert.match(unit, /SuccessExitStatus=.*\b1\b/, 'failing to change Wi-Fi must not be a failed unit that blocks the station');
  assert.match(unit, /Before=radiotower\.service/);
});

test('install.sh installs the script and enables the unit', async () => {
  const src = await fs.readFile(path.join(REPO_ROOT, 'pi', 'install.sh'), 'utf8');
  assert.match(src, /radiotower-network/, 'pi/install.sh must install the network script, or none of this ships');
  assert.match(src, /systemctl enable radiotower-network/);
});
