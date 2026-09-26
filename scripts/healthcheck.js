#!/usr/bin/env node
/**
 * Radio Tower — health probe.
 *
 * Prints a one-screen status report and exits non-zero if the station is off
 * air. Safe to run from cron, from a monitoring agent, or by hand over SSH.
 *
 *   node scripts/healthcheck.js [baseUrl]
 *   node scripts/healthcheck.js --json
 */
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const base = args.find((a) => a.startsWith('http')) || process.env.TOWER_URL || 'http://127.0.0.1:8080';

const fmtDuration = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
};

async function get(path) {
  const res = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

try {
  const t0 = Date.now();
  const health = await get('/api/health');
  const latency = Date.now() - t0;
  const station = await get('/api/station');

  if (asJson) {
    console.log(JSON.stringify({ ...health, latencyMs: latency, onAir: station.onAir }, null, 2));
  } else {
    const nowPlaying = station.onAir
      ? `${station.onAir.title} — ${station.onAir.artist} (${Math.round(station.onAir.offset)}s/${Math.round(station.onAir.duration)}s)`
      : 'dead air';
    console.log(`
  ${health.ok ? '\x1b[32m●\x1b[0m ON AIR' : '\x1b[31m●\x1b[0m OFF AIR'}   ${base}

  now playing   ${nowPlaying}
  up next       ${station.upcoming?.[0] ? `${station.upcoming[0].title} — ${station.upcoming[0].artist}` : '—'}
  listeners     ${health.listeners}
  library       ${health.tracks} tracks · ${fmtDuration(health.cycleSeconds)} per cycle
  uptime        ${fmtDuration(health.uptimeSeconds)}
  memory        ${health.memoryMb} MB
  latency       ${latency} ms
  last scan     ${health.lastScanAt ? new Date(health.lastScanAt).toISOString() : 'never'}
  node          ${health.node}
`);
  }
  process.exit(health.ok ? 0 : 1);
} catch (err) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: err.message, base }));
  else console.error(`\n  \x1b[31m● UNREACHABLE\x1b[0m  ${base}\n  ${err.message}\n`);
  process.exit(2);
}
