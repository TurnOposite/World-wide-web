#!/usr/bin/env node
/**
 * The map of the site from a terminal (docs/ATELIER.md) — the same edits as
 * the Atelier, one line each, on site/data/layout.json. A page is named by
 * its code (Z-04), its id (atlas) or its title, any case.
 *
 *   npm run layout                         # the map: code, page, place, size, tilt, online
 *   npm run layout -- check                # is it sound? (exit 1 on an error)
 *   npm run layout -- move atlas 1200 900  # put a window at x, y
 *   npm run layout -- nudge Z-04 +100 -50  # move it by so much
 *   npm run layout -- size atlas 700 720   # width, height
 *   npm run layout -- tilt atlas 2         # degrees
 *   npm run layout -- swap atlas playlists # two windows trade places
 *   npm run layout -- tag atlas 8 44 5     # the menu tag: % from the side, % from the top, tilt
 *   npm run layout -- online v1            # a version of the past, on the site…
 *   npm run layout -- offline v1           # …or not
 *
 * A change that leaves the map with an error is refused and nothing is
 * written. Publishing is `fire`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD } from '../site/js/world/layout.js';
import { checkLayout, layoutFile, resolveLayout, stringifyLayout, worldHeight } from '../site/js/world/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LAYOUT = path.join(ROOT, 'site/data/layout.json');

export function findPage(pages, name) {
  const n = String(name || '').toLowerCase();
  // An id or a code before a title: two pages may share one (Zone's Atlas and Echo's, since 2026-11-01).
  const hit = pages.find((p) => p.id === n) || pages.find((p) => String(p.code).toLowerCase() === n) || pages.find((p) => String(p.title).toLowerCase() === n);
  if (!hit) throw new Error(`no page "${name}" — try one of: ${pages.map((p) => p.code).join(' ')}`);
  return hit;
}

const number = (v, what) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${what} must be a number, not "${v}"`);
  return n;
};

/**
 * One edit on a map (all pages, offline ones included). Returns a sentence
 * saying what changed; throws on a bad command. Pure on `pages`.
 */
export function edit(pages, [cmd, a, ...rest]) {
  const p = a !== undefined ? findPage(pages, a) : null;
  const need = (n) => { if (rest.length < n || !p) throw new Error(`usage: ${cmd} <page>${' <n>'.repeat(n)}`); };
  switch (cmd) {
    case 'move': need(2); p.x = number(rest[0], 'x'); p.y = number(rest[1], 'y'); return `${p.code} ${p.title} → ${p.x}, ${p.y}`;
    case 'nudge': need(2); p.x += number(rest[0], 'dx'); p.y += number(rest[1], 'dy'); return `${p.code} ${p.title} → ${p.x}, ${p.y}`;
    case 'size': need(2); p.w = number(rest[0], 'width'); p.h = number(rest[1], 'height'); return `${p.code} ${p.title} → ${p.w} × ${p.h}`;
    case 'tilt': need(1); p.rot = number(rest[0], 'tilt'); return `${p.code} ${p.title} tilted ${p.rot}°`;
    case 'tag': need(3); p.tag = rest.slice(0, 3).map((v, i) => number(v, ['side %', 'top %', 'tilt'][i])); return `${p.code} ${p.title}'s tag → ${p.tag.join(', ')}`;
    case 'swap': {
      if (!p || !rest[0]) throw new Error('usage: swap <page> <page>');
      const q = findPage(pages, rest[0]);
      for (const k of ['x', 'y', 'w', 'h', 'rot']) [p[k], q[k]] = [q[k], p[k]];
      [p.tag, q.tag] = [q.tag, p.tag];
      return `${p.code} ${p.title} ⇄ ${q.code} ${q.title}`;
    }
    case 'online': case 'offline':
      if (!p) throw new Error(`usage: ${cmd} <version>`);
      if (p.era !== 'past') throw new Error(`${p.title} is a page of today — only the versions of the past go online and offline`);
      p.status = cmd;
      return `${p.code} ${p.title} is ${cmd} (once published)`;
    default:
      throw new Error(`unknown command "${cmd}" — move, nudge, size, tilt, tag, swap, online, offline, check`);
  }
}

export function table(pages) {
  const rows = pages.map((p) => `  ${String(p.code).padEnd(5)} ${String(p.title).padEnd(10)} ${`${p.x}, ${p.y}`.padEnd(11)} ${`${p.w} × ${p.h}`.padEnd(11)} ${String(p.rot).padStart(5)}°  ${p.era === 'past' ? (p.status === 'online' ? 'online' : 'OFFLINE') : ''}`);
  return [`  code  page       x, y        w × h         tilt`, ...rows].join('\n');
}

export function report(pages) {
  const issues = checkLayout(pages);
  return { issues, errors: issues.filter((i) => i.level === 'error'), text: issues.map((i) => `  ${i.level === 'error' ? '✗' : '!'} ${i.id}: ${i.msg}`).join('\n') };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  try {
    const file = JSON.parse(fs.readFileSync(LAYOUT, 'utf8'));
    const { pages, problems } = resolveLayout(file, { all: true });
    if (problems.length) throw new Error(problems.join('; '));
    WORLD.h = worldHeight(pages);
    if (!args.length || args[0] === 'check') {
      if (!args.length) console.log(table(pages));
      const r = report(pages);
      console.log(r.issues.length ? r.text : '  ✓ the map holds: no window on another, every phone frame clear');
      process.exit(r.errors.length ? 1 : 0);
    }
    const said = edit(pages, args);
    WORLD.h = worldHeight(pages);
    const r = report(pages);
    if (r.errors.length) throw new Error(`not written — it would leave the map broken:\n${r.text}`);
    fs.writeFileSync(LAYOUT, stringifyLayout(layoutFile(pages)));
    console.log(`  ✓ ${said}${r.issues.length ? `\n${r.text}` : ''}\n  Written to site/data/layout.json — see it with \`npm run site\`, publish with \`fire\`.`);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    process.exit(1);
  }
}
