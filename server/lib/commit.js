/**
 * Which commit is this code? Read once at start, for /api/health — so « is
 * the tower on the commit GitHub and Vercel are on? » is one request, not an
 * SSH session (npm run status; the Booth's Status side).
 *
 * Read from the files git keeps, never by running git: the station runs as
 * its own user in a checkout that belongs to root, which git refuses to
 * touch (« dubious ownership »), and the service has no business spawning
 * programs. TOWER_COMMIT overrides it (a build stamped some other way). No
 * checkout, or files it cannot read: null — never a guess.
 */
import fs from 'node:fs';
import path from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
const readText = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };

/** The folder git keeps its files in: `.git`, or where a worktree's `.git` file points; and the shared one. */
function gitDirs(root) {
  const dot = path.join(root, '.git');
  let dir = dot;
  const asFile = (() => { try { return fs.statSync(dot).isFile() ? readText(dot) : null; } catch { return null; } })();
  if (asFile) {
    const m = /^gitdir:\s*(.+)\s*$/m.exec(asFile);
    if (!m) return null;
    dir = path.resolve(root, m[1].trim());
  }
  const common = readText(path.join(dir, 'commondir'));
  return { dir, common: common ? path.resolve(dir, common.trim()) : dir };
}

/** The commit checked out in `root`, or null. */
export function readCommit(root, env = process.env) {
  const forced = String(env.TOWER_COMMIT || '').trim().toLowerCase();
  if (SHA.test(forced)) return forced;
  const dirs = gitDirs(root);
  if (!dirs) return null;
  const head = readText(path.join(dirs.dir, 'HEAD'))?.trim();
  if (!head) return null;
  if (SHA.test(head)) return head;
  const ref = /^ref:\s*(\S+)$/.exec(head)?.[1];
  if (!ref || ref.includes('..')) return null;
  for (const base of [dirs.dir, dirs.common]) {
    const loose = readText(path.join(base, ref))?.trim();
    if (loose && SHA.test(loose)) return loose;
  }
  const packed = readText(path.join(dirs.common, 'packed-refs'));
  const line = packed?.split('\n').find((l) => l.endsWith(` ${ref}`));
  const sha = line?.split(' ')[0];
  return sha && SHA.test(sha) ? sha : null;
}

/** `owner/name` of the GitHub repository this checkout came from, or null. */
export function readRepo(root) {
  const dirs = gitDirs(root);
  const cfg = dirs && readText(path.join(dirs.common, 'config'));
  const url = cfg && /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(cfg)?.[1];
  const m = url && /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}
