/**
 * Dev-only hot reload for `public/`.
 *
 * Watches the static asset folder and tells any open tab which file changed
 * over a Server-Sent Events stream. `public/app.js` decides what to do with
 * that: a `viz.js` change rebuilds the Visualizer in place, everything else
 * falls back to a plain reload (safe here because the station clock means a
 * fresh page always rejoins live — there is no playback state to lose).
 *
 * Only ever wired up from the `isMain` boot block in `server/index.js`, gated
 * on `NODE_ENV !== 'production'` — never from `createApp()`, which is what
 * the test suite imports directly. That keeps every test process from
 * opening its own `fs.watch` handle on every `createApp()` call.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {import('express').Express} app
 * @param {string} publicDir  absolute path to the folder being served
 */
export function attachDevReload(app, publicDir) {
  const clients = new Set();
  let pending = new Set();
  let timer = null;

  const broadcast = () => {
    if (!pending.size) return;
    const files = [...pending];
    pending = new Set();
    const payload = `data: ${JSON.stringify({ files })}\n\n`;
    for (const res of clients) res.write(payload);
  };

  const onChange = (_event, filename) => {
    if (!filename) return;
    // fs.watch's filename separator is platform-native; normalise so the
    // client always sees forward slashes regardless of OS.
    pending.add(String(filename).replace(/\\/g, '/'));
    clearTimeout(timer);
    timer = setTimeout(broadcast, 120);
  };

  // `recursive` is only supported on macOS and Windows in most Node builds —
  // Linux support is newer and not universal. Fall back to watching the top
  // level plus each subdirectory that exists right now. This is dev tooling
  // only; a subdirectory created *after* boot on an unsupported platform
  // simply won't be watched until the next `npm run dev` restart, which is
  // an acceptable gap for a convenience feature that never ships to a
  // listener.
  try {
    fs.watch(publicDir, { recursive: true }, onChange);
  } catch {
    fs.watch(publicDir, onChange);
    for (const entry of fs.readdirSync(publicDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        fs.watch(path.join(publicDir, entry.name), onChange);
      } catch {
        /* best effort */
      }
    }
  }

  app.get('/api/dev/reload', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.flushHeaders?.();
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });
}

export default attachDevReload;
