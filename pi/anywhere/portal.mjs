#!/usr/bin/env node
/**
 * Radio Tower — the setup portal. Connect the tower to any Wi-Fi from a phone.
 *
 * WHY THIS EXISTS
 *
 * pi/wifi/ lets you move the tower to a network you know about in advance
 * (edit a text file on the SD card). This covers the case you don't: you
 * arrive somewhere new — a friend's flat, a hotel, a café — with the tower in
 * your bag and no laptop. When the tower can't reach any network it knows,
 * radiotower-network brings up its own Wi-Fi ("Radio Tower Setup") and starts
 * this page. Join that network from your phone, the page pops up (captive
 * portal), pick the router, type its password, done. The tower remembers it
 * in radiotower-wifi.txt like any other network, so next boot it just joins.
 *
 * Runs only while the setup hotspot is up (radiotower-portal.service is
 * started and stopped by radiotower-network), on port 80 so phones' captive-
 * portal detection finds it. Anyone who can see this page already knew the
 * hotspot's WPA password, which is the access control.
 *
 * Zero dependencies — node:http only — so it runs before, or without,
 * npm install having happened.
 *
 * Environment (all overridable, which is how tests/pi-anywhere.test.js drives
 * it without a Pi):
 *   RT_PORTAL_PORT   (80)       RT_PORTAL_HOST (0.0.0.0)
 *   RT_WIFI_CONFIG   (/boot/firmware/radiotower-wifi.txt)
 *   RT_SCAN_FILE     (/run/radiotower/scan.txt)    nmcli -t SSID:SIGNAL:SECURITY
 *   RT_STATUS_FILE   (/run/radiotower/status.json) written by the watchdog
 *   RT_JOIN_RESULT   (/run/radiotower/last-join.txt)
 *   RT_JOIN_CMD      (/usr/local/sbin/radiotower-network --after-portal)
 *   RT_STATION_URL   (http://10.42.0.1:8080)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const env = process.env;
const PORT = Number(env.RT_PORTAL_PORT || 80);
const HOST = env.RT_PORTAL_HOST || '0.0.0.0';
const WIFI_CONFIG = env.RT_WIFI_CONFIG || '/boot/firmware/radiotower-wifi.txt';
const SCAN_FILE = env.RT_SCAN_FILE || '/run/radiotower/scan.txt';
const STATUS_FILE = env.RT_STATUS_FILE || '/run/radiotower/status.json';
const JOIN_RESULT = env.RT_JOIN_RESULT || '/run/radiotower/last-join.txt';
const JOIN_CMD = (env.RT_JOIN_CMD || '/usr/local/sbin/radiotower-network --after-portal').split(' ').filter(Boolean);
const STATION_URL = env.RT_STATION_URL || 'http://10.42.0.1:8080';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const read = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

/** `nmcli -t -f SSID,SIGNAL,SECURITY dev wifi list` → [{ssid, signal, secure}], strongest first, deduped. */
export function parseScan(text) {
  const best = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    // nmcli -t escapes ':' inside fields as '\:'. Split on unescaped colons.
    const fields = line.split(/(?<!\\):/).map((f) => f.replace(/\\:/g, ':').replace(/\\\\/g, '\\'));
    const [ssid, signal, security = ''] = fields;
    if (!ssid || ssid === '--') continue;
    const entry = { ssid, signal: Number(signal) || 0, secure: Boolean(security && security !== '--') };
    const prev = best.get(ssid);
    if (!prev || entry.signal > prev.signal) best.set(ssid, entry);
  }
  return [...best.values()].sort((a, b) => b.signal - a.signal);
}

/** The same rules WPA2 and radiotower-network.sh apply, checked before we write anything. */
export function validate(ssid, password) {
  const s = String(ssid ?? '').trim();
  const p = String(password ?? '');
  if (!s) return 'Pick a network or type its name.';
  if (Buffer.byteLength(s, 'utf8') > 32) return 'That network name is longer than Wi-Fi allows (32 bytes).';
  if (/[\r\n|]/.test(s)) return 'Network names containing "|" or line breaks cannot be saved from here — use the SD card file.';
  if (/[\r\n|]/.test(p)) return 'Passwords containing "|" cannot be saved from here — use the SD card file.';
  if (p && (p.length < 8 || p.length > 63)) return 'Wi-Fi passwords are 8 to 63 characters. Leave it empty for an open network.';
  return null;
}

/**
 * Put `ssid | password` at the TOP of the Wi-Fi file (top line wins in
 * radiotower-network), removing any older line for the same network, and
 * keeping every comment and every other network exactly as the owner wrote
 * them. Written to a temp file and renamed, so a power cut mid-write leaves
 * the old file rather than half of a new one.
 */
export function upsertNetwork(fileText, ssid, password) {
  const lines = fileText.replace(/\r\n/g, '\n').split('\n');
  const want = ssid.trim();
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('|')) return true;
    const name = t.slice(0, t.indexOf('|')).trim();
    return name !== want;
  });
  const entry = `${want} | ${password}`;
  // After any leading comment block, so the file's own instructions stay on top.
  let at = 0;
  while (at < kept.length && (kept[at].trim().startsWith('#') || kept[at].trim() === '')) at++;
  kept.splice(at, 0, entry);
  return kept.join('\n').replace(/\n*$/, '\n');
}

function writeAtomic(file, text) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const PAGE_CSS = `
:root{--bg:#0b0d10;--raise:#12161b;--line:#232a33;--text:#e8edf3;--dim:#96a1ae;--faint:#67717d;--signal:#ffb340;--live:#ff4d4d;--ok:#3ddc84}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:20px 16px 40px}
main{max-width:460px;margin:0 auto}h1{font-size:20px;margin:6px 0 2px}p{color:var(--dim)}
.card{background:var(--raise);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:14px}
label{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:12px 0 6px}
select,input{width:100%;background:#0e1216;border:1px solid var(--line);border-radius:10px;color:var(--text);padding:12px;font:inherit}
button,.btn{display:block;width:100%;margin-top:16px;background:var(--signal);color:#1a1206;border:0;border-radius:999px;padding:13px;font:600 15px inherit;text-align:center;text-decoration:none}
.ghost{background:transparent;color:var(--dim);border:1px solid var(--line)}
.err{color:var(--live)}.ok{color:var(--ok)}.small{font-size:12.5px;color:var(--faint)}
.bars{font-family:ui-monospace,Menlo,monospace;color:var(--signal)}`;

function page(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><main>
<p class="small">📡 Radio Tower · setup</p>${body}</main></body></html>`;
}

const bars = (n) => (n >= 75 ? '▂▄▆█' : n >= 50 ? '▂▄▆·' : n >= 25 ? '▂▄··' : '▂···');

function homePage(message = '', tone = '') {
  const networks = parseScan(read(SCAN_FILE));
  const last = read(JOIN_RESULT).trim();
  let status = {};
  try {
    status = JSON.parse(read(STATUS_FILE) || '{}');
  } catch { /* the watchdog may not have run yet */ }
  const options = networks
    .map((n) => `<option value="${esc(n.ssid)}">${esc(n.ssid)} ${bars(n.signal)}${n.secure ? ' 🔒' : ''}</option>`)
    .join('');
  return page(
    'Radio Tower setup',
    `<h1>Connect the tower to Wi-Fi</h1>
<p>The tower couldn't find a network it knows, so it made this one. Choose the Wi-Fi it should join — it will remember it from now on.</p>
${message ? `<p class="${tone}">${esc(message)}</p>` : ''}
${last ? `<p class="small">Last attempt: ${esc(last)}</p>` : ''}
<form class="card" method="post" action="/join">
  <label for="ssid">Network</label>
  <select id="ssid" name="ssid">${options}<option value="">Other (type it below)…</option></select>
  <label for="other">Or type the name</label>
  <input id="other" name="other" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Hidden or unlisted network">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="off" placeholder="Leave empty for an open network">
  <button type="submit">Save and connect</button>
</form>
<div class="card">
  <p style="margin-top:0">Just want to listen? The station is playing on this Wi-Fi right now, no internet needed.</p>
  <a class="btn ghost" href="${esc(STATION_URL)}">Listen to the tower</a>
  <p class="small">Networks seen when this hotspot started: ${networks.length}. ${status.state ? `Tower state: ${esc(status.state)}.` : ''}</p>
</div>`,
  );
}

function switchingPage(ssid) {
  return page(
    'Switching…',
    `<h1>Joining “${esc(ssid)}”</h1>
<div class="card">
<p class="ok">Saved. The tower is leaving this setup Wi-Fi now to join your network — your phone will drop off it in a few seconds.</p>
<p><b>If it worked:</b> put your phone back on “${esc(ssid)}”. In about a minute the station is live at your domain, and at <b>http://radiotower.local:8080</b> on that network.</p>
<p><b>If “Radio Tower Setup” comes back</b> within two minutes, the tower couldn't join — usually a mistyped password. Rejoin it; this page will say what went wrong.</p>
</div>`,
  );
}

async function readBody(req, limit = 4096) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

let joining = false;

export function createPortal() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://portal');
    const send = (code, html, headers = {}) => {
      res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
      res.end(html);
    };
    try {
      if (req.method === 'POST' && url.pathname === '/join') {
        const form = new URLSearchParams(await readBody(req));
        const ssid = (form.get('other') || '').trim() || (form.get('ssid') || '').trim();
        const password = form.get('password') || '';
        const problem = validate(ssid, password);
        if (problem) return send(400, homePage(problem, 'err'));
        if (joining) return send(409, homePage('Already switching networks — give it a minute.', 'err'));
        writeAtomic(WIFI_CONFIG, upsertNetwork(read(WIFI_CONFIG), ssid, password));
        joining = true;
        send(200, switchingPage(ssid));
        // Reply first, then switch: once the hotspot goes down this phone
        // can no longer receive anything. Detached so the switch survives
        // this service being stopped by the very script it launches.
        setTimeout(() => {
          try {
            const child = spawn(JOIN_CMD[0], JOIN_CMD.slice(1), { detached: true, stdio: 'ignore' });
            child.on('error', () => { joining = false; });
            child.unref();
          } catch {
            joining = false;
          }
        }, 1500).unref();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, homePage());
      if (url.pathname === '/status.json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(read(STATUS_FILE) || '{}');
      }
      // Everything else — including the probe URLs phones use to detect a
      // captive portal (/generate_204, /hotspot-detect.html, /connecttest.txt)
      // — gets the setup page. Answering a probe with anything other than
      // what the OS expects is what makes the phone pop this page up.
      if (url.pathname !== '/') return send(302, '', { Location: '/' });
      return send(200, homePage());
    } catch (err) {
      return send(500, page('Error', `<p class="err">${esc(err.message)}</p>`));
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = createPortal();
  server.listen(PORT, HOST, () => console.log(`radiotower-portal: setup page on http://${HOST}:${PORT}`));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
}
