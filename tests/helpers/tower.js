/**
 * One way to start a tower for a test (docs/TESTS-REVIEW.md, step 3).
 *
 *   const tower = await startTower({ env: { STATION_KEY: KEY } });
 *   test.after(() => tower.close());
 *   const body = await tower.json('/api/station');
 *
 * Before 2026-11-17 eleven files each set the environment, imported the server, scanned, listened and closed in
 * their own way. What they all need is here; what one file needs of its own stays in `env`.
 *
 * The server reads its settings once, when it is first imported, and each test file is its own process: so call
 * this before anything imports `server/config.js` (the server's own modules), and once per file.
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Settings every test tower shares: a fixed epoch (the same programme every run), no rescans behind the test's back. */
export const TOWER_DEFAULTS = { STATION_EPOCH: '2026-01-01T00:00:00Z', AUTO_RESCAN_MINUTES: '0' };

/**
 * @param {object} [o]
 * @param {string} [o.music]   the library folder; a new empty one in the temp folder if not given
 * @param {string} [o.prefix]  the new folder's name prefix
 * @param {object} [o.env]     anything else this tower needs (STATION_KEY, TELEGRAPH_LOG, …); wins over the defaults
 * @param {boolean} [o.scan]   scan the library before listening (default yes)
 * @param {() => number} [o.now] the budgets' clock (createApp({ now }))
 */
export async function startTower({ music, prefix = 'rt-tower-', env = {}, scan = true, now } = {}) {
  music ??= await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  Object.assign(process.env, { ...TOWER_DEFAULTS, MUSIC_DIR: music, CACHE_FILE: path.join(music, '.cache', 'library.json'), ...env });
  const mod = await import('../../server/index.js');
  if (scan) await mod.rescan({ useCache: false });
  const app = mod.createApp({ now });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p, init) => fetch(base + p, init);
  return {
    base, music, mod, app, server, get,
    json: async (p, init) => (await get(p, init)).json(),
    post: (p, body = {}, headers = {}) => get(p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}
