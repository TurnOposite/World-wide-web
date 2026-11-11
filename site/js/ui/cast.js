/**
 * The cast: who a listener can be on the telegraph line and in the
 * mini-player (Ortis, 2026-11-11: a character select — « slide for a
 * different character, and once selected swipe again for a few clothes
 * colour changes »).
 *
 * The characters are the station's own: eight people (and one machine) who
 * could work a radio tower, drawn here as 16 × 20 pixel sprites. They are
 * not taken from any game — a published game's characters are its makers',
 * and this site is public — so the gesture is the borrowed part, the cast
 * is ours.
 *
 * A sprite is a shared body (BASE) with the character's own rows laid over
 * it, coloured by the character (skin, hair, their one prop) and by the
 * look they wear (the clothes: WARDROBE). A choice travels as a plain icon
 * name — `cast.<character>.<look>` — which the tower already accepts
 * (server/lib/telegraph.js cleanIcon): no server change, and a tower that
 * predates the cast still carries it.
 *
 * The top of this file is pure (no DOM) so node:test can check it.
 */

export const W = 16;
export const H = 20;
/** Head and shoulders: what a 28-pixel face on the line shows. */
export const BUST_H = 16;

/**
 * The shared body. o outline · s skin · e eye · m mouth · c clothes ·
 * a the clothes' accent · p trousers · b boots.
 */
export const BASE = [
  '................',
  '................',
  '................',
  '.....oooooo.....',
  '....osssssso....',
  '...osssssssso...',
  '...osssssssso...',
  '...ossessesso...',
  '...osssmmssso...',
  '....osssssso....',
  '.....oossoo.....',
  '....occcccco....',
  '...occcaaccco...',
  '...osccccccso...',
  '...ooccccccoo...',
  '....occcccco....',
  '....oppppppo....',
  '....oppooppo....',
  '....obboobbo....',
  '....oooooooo....',
];

/** The clothes. c and C the garment and its shade, a and A its accent, p trousers, b boots. */
export const WARDROBE = {
  signal: { c: '#e2603a', C: '#b8431f', a: '#ffd166', A: '#d9a93d', p: '#27303b', b: '#11151a' },
  tide: { c: '#2f7fbf', C: '#1f5c8f', a: '#f2efe6', A: '#c9c5b8', p: '#1d2733', b: '#0f1419' },
  moss: { c: '#4f9a5c', C: '#377243', a: '#f0c75e', A: '#c79f3d', p: '#3a2f28', b: '#17120f' },
  plum: { c: '#8a4fb0', C: '#663786', a: '#7fe0d0', A: '#55b3a4', p: '#241f33', b: '#110e1a' },
  sand: { c: '#d9b98a', C: '#b39265', a: '#c0453a', A: '#96302a', p: '#4a5560', b: '#1c2126' },
  night: { c: '#343c4f', C: '#232937', a: '#ff5d73', A: '#cc3f55', p: '#1a1f2a', b: '#0a0c11' },
  rose: { c: '#e07a9a', C: '#b65676', a: '#fff3d6', A: '#d8caa8', p: '#3b2a3f', b: '#1a121c' },
  ash: { c: '#bfbdb6', C: '#96948d', a: '#2c2d30', A: '#111214', p: '#5a5955', b: '#232323' },
};
export const LOOK_NAMES = { signal: 'ember', tide: 'tide', moss: 'moss', plum: 'plum', sand: 'sand', night: 'night', rose: 'rose', ash: 'ash' };

const INK = '#14161c';
const WHITE = '#f4f1ea';

/**
 * The cast. `rows` are laid over BASE by row number: a dot keeps what is
 * underneath, an underscore clears it. h hair · x the character's prop ·
 * w white. `looks` are four WARDROBE names, the first the one they arrive in.
 */
export const CAST = [
  {
    id: 'operator', name: 'The Operator', line: 'Headphones on, one hand on the fader.',
    skin: '#e8b48c', hair: '#4a3a30', prop: '#3fd0c9', looks: ['signal', 'tide', 'night', 'moss'],
    rows: { 2: '....xxxxxxxx....', 3: '...xx......xx...', 4: '..xx.hhhhhh.xx..', 5: '..xxhhhhhhhhxx..', 6: '..xxh......hxx..', 7: '..xx........xx..', 8: '...x........x...' },
  },
  {
    id: 'keeper', name: 'The Keeper', line: 'Minds the light at the top of the mast.',
    skin: '#f0c9a4', hair: '#c9c4b8', prop: '#c9c4b8', looks: ['tide', 'signal', 'moss', 'ash'],
    rows: { 0: '.......ww.......', 1: '......aaaa......', 2: '....aaaaaaaa....', 3: '...aaaaaaaaaa...', 4: '...aaaaaaaaaa...', 5: '...AAAAAAAAAA...', 8: '...ohhhmmhhho...', 9: '....ohhhhhho....', 10: '.....ohhhho.....' },
  },
  {
    id: 'courier', name: 'The Courier', line: 'Carries the crates between stations.',
    skin: '#c98e62', hair: '#1d1a1a', prop: '#7a5535', looks: ['moss', 'sand', 'plum', 'signal'],
    rows: { 2: '.....aaaaaa.....', 3: '....aaaaaaaa....', 4: '...aaaaaaaaaa...', 5: '...AAAAAAAAAAAA.', 6: '...ohssssssho...', 11: '....occcccxo....', 12: '...occcccxcco...', 13: '...oscccxccso...', 14: '...ooccxcccoo...', 15: '....oxxcccco....', 16: '....oxxppppo....' },
  },
  {
    id: 'archivist', name: 'The Archivist', line: 'Knows which shelf every record is on.',
    skin: '#f2d3b3', hair: '#a04a32', prop: '#d9a93d', looks: ['plum', 'rose', 'tide', 'sand'],
    rows: { 0: '......hhhh......', 1: '......hhhh......', 2: '.......hh.......', 3: '.....hhhhhh.....', 4: '....hhhhhhhh....', 5: '...hhhhsshhhh...', 6: '...hhsssssshh...', 7: '...hsxexxexsh...', 8: '...h........h...', 9: '...hh......hh...' },
  },
  {
    id: 'driver', name: 'The Night Driver', line: 'Only tunes in after midnight.',
    skin: '#a86e48', hair: '#43306b', prop: '#f04a5d', looks: ['night', 'plum', 'signal', 'ash'],
    rows: { 3: '.....hhhhhh.....', 4: '....hhhhhhhh....', 5: '...hhhhhhhhhh...', 6: '..hhhsssssshhh..', 7: '..hhxxxxxxxxhh..', 8: '..hhsssmmssshh..', 9: '..hhhsssssshhh..', 10: '..hhhoossoohhh..', 11: '..hh........hh..', 12: '..h..........h..' },
  },
  {
    id: 'digger', name: 'The Crate Digger', line: 'Found this one in a box marked « misc ».',
    skin: '#8a5636', hair: '#3d2b22', prop: '#f0c75e', looks: ['sand', 'moss', 'rose', 'tide'],
    rows: { 0: '.....hhhhhh.....', 1: '...hhhhhhhhhh...', 2: '..hhhhhhhhhhhh..', 3: '..hhhhhhhhhhhh..', 4: '.hhhhhhhhhhhhhh.', 5: '.hhhhsssssshhhh.', 6: '.hhhsssssssshhh.', 7: '.hhhssessesshhh.', 8: '..hhsssmmssshh..', 9: '...hossssssoh...', 12: '...occcxxccco...' },
  },
  {
    id: 'ash', name: 'Ash', line: 'Came over from the Echo side.',
    skin: '#dedbd3', hair: '#dedbd3', prop: '#dedbd3', mouth: '#8f8c86', looks: ['ash', 'night', 'plum', 'tide'],
    rows: { 1: '.....cccccc.....', 2: '....cccccccc....', 3: '...cccccccccc...', 4: '..cccCCCCCCccc..', 5: '..ccCssssssCcc..', 6: '..ccsssssssscc..', 7: '..ccssessesscc..', 8: '..ccsssmmssscc..', 9: '..cccssssssccc..', 10: '...ccccsscccc...' },
  },
  {
    id: 'relay', name: 'Relay', line: 'The tower\'s own machine. Hums in tune.',
    skin: '#aeb8c2', hair: '#aeb8c2', prop: '#8793a0', looks: ['tide', 'signal', 'plum', 'moss'],
    rows: { 0: '.......a........', 1: '.......o........', 2: '.......o........', 3: '...oooooooooo...', 4: '...oxxxxxxxxo...', 5: '...oxxxxxxxxo...', 6: '...oxooooooxo...', 7: '...oxoaooaoxo...', 8: '...oxooooooxo...', 9: '...oxxxxxxxxo...', 10: '...oooxxxxooo...', 13: '...ox......xo...' },
  },
];

const BY_ID = new Map(CAST.map((c) => [c.id, c]));
const ICON = /^cast\.([a-z]+)\.([0-9])$/;

/** The icon name a choice travels under. */
export const castIcon = (id, look = 0) => `cast.${id}.${look}`;

/** An icon name back to its character and look — or null when it is not one of the cast's. */
export function parseCast(icon) {
  const m = typeof icon === 'string' ? ICON.exec(icon) : null;
  const who = m && BY_ID.get(m[1]);
  if (!who || Number(m[2]) >= who.looks.length) return null;
  return { who, look: Number(m[2]) };
}

/** The 16 × 20 grid of a character: BASE with their rows laid over it. */
export function grid(who) {
  return BASE.map((row, y) => {
    const over = who.rows?.[y];
    if (!over) return row;
    return [...row].map((ch, x) => (over[x] === '.' ? ch : over[x] === '_' ? '.' : over[x])).join('');
  });
}

/** Every colour a cell letter can take, for one character in one look. */
export function palette(who, look = 0) {
  const wear = WARDROBE[who.looks[look] ?? who.looks[0]];
  return { o: INK, e: INK, w: WHITE, s: who.skin, m: who.mouth || '#8a4a3f', h: who.hair, x: who.prop, ...wear };
}

/**
 * The sprite as runs of one colour: [{ x, y, w, fill }], row by row. Runs
 * rather than cells, so a face is a few dozen rectangles and not 320.
 */
export function runs(who, look = 0, rows = H) {
  const pal = palette(who, look);
  const out = [];
  grid(who).slice(0, rows).forEach((row, y) => {
    let x = 0;
    while (x < W) {
      const ch = row[x];
      let n = 1;
      while (x + n < W && row[x + n] === ch) n += 1;
      if (ch !== '.') out.push({ x, y, w: n, fill: pal[ch] });
      x += n;
    }
  });
  return out;
}

/** The sprite as an SVG document. `bust` crops to head and shoulders, a square. */
export function castSvg(who, look = 0, { bust = false } = {}) {
  const rows = bust ? BUST_H : H;
  const byFill = new Map();
  for (const r of runs(who, look, rows)) byFill.set(r.fill, `${byFill.get(r.fill) || ''}M${r.x} ${r.y}h${r.w}v1h-${r.w}z`);
  const paths = [...byFill].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${rows}" shape-rendering="crispEdges">${paths}</svg>`;
}

const URLS = new Map();
/** A sprite as an image address, made once per icon: a face on the line is then one <img>. */
export function castUrl(icon, { bust = false } = {}) {
  const hit = parseCast(icon);
  if (!hit) return null;
  const key = `${icon}|${bust ? 'b' : 'f'}`;
  if (!URLS.has(key)) URLS.set(key, `data:image/svg+xml,${encodeURIComponent(castSvg(hit.who, hit.look, { bust }))}`);
  return URLS.get(key);
}

/** What a screen reader is told a choice is. */
export function castLabel(icon) {
  const hit = parseCast(icon);
  return hit ? `${hit.who.name}, in ${LOOK_NAMES[hit.who.looks[hit.look]]}` : '';
}

/** One step along a ring of n, either way. */
export const step = (i, by, n) => (((i + by) % n) + n) % n;

/** A drag far enough sideways to count as a slide: -1 to the next, +1 back, 0 neither. */
export function swipe(dx, dy, min = 28) {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

/* ------------------------------------------------------------------ DOM -- */
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** A face for an icon of the cast — an <img> — or null when the icon is not one. */
export function castFace(icon, cls = '', size = 28) {
  const url = castUrl(icon, { bust: true });
  if (!url) return null;
  const img = h('img', `${cls} cast-face`.trim());
  img.src = url;
  img.alt = '';
  img.width = size;
  img.height = size;
  img.decoding = 'async';
  img.dataset.icon = icon;
  return img;
}

/**
 * The character select. Two steps, one gesture:
 *
 *   who   slide (drag, the arrows, ← →, or a thumb underneath) to change character;
 *   look  once chosen, the same slide changes the colour of their clothes.
 *
 * `pictures` are the icon bank's files ({ file, label, url }): they follow the
 * cast on the reel and have no looks.
 */
export class CastPicker {
  constructor({ root, value = null, pictures = [], onChange = () => {} }) {
    this.root = root;
    this.onChange = onChange;
    this.entries = [...CAST.map((who) => ({ who })), ...pictures.map((pic) => ({ pic }))];
    this.looks = new Map(); // the look last worn by each character, so sliding away and back keeps it
    this.i = 0;
    this.stepName = 'who';
    const hit = parseCast(value);
    if (hit) {
      this.i = CAST.indexOf(hit.who);
      this.looks.set(hit.who.id, hit.look);
      this.stepName = 'look';
    } else if (value) {
      const at = this.entries.findIndex((e) => e.pic?.file === value);
      if (at >= 0) this.i = at;
    }

    root.classList.add('cast');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Your character');
    this.legend = h('p', 'cast-legend');
    this.stage = h('div', 'cast-stage');
    this.stage.tabIndex = 0;
    this.stage.setAttribute('aria-roledescription', 'carousel');
    const arrow = (by, label, glyph) => {
      const b = h('button', 'cast-arrow', glyph);
      b.type = 'button';
      b.dataset.go = String(by);
      b.setAttribute('aria-label', label);
      return b;
    };
    this.prev = arrow(-1, 'Previous', '‹');
    this.next = arrow(1, 'Next', '›');
    this.reel = h('div', 'cast-reel');
    this.stage.append(this.prev, this.reel, this.next);
    this.name = h('p', 'cast-name');
    this.name.setAttribute('aria-live', 'polite');
    this.ctl = h('div', 'cast-ctl');
    this.strip = h('div', 'cast-strip');
    root.replaceChildren(this.legend, this.stage, this.name, this.ctl, this.strip);

    this.stage.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-go]');
      if (b) this.go(Number(b.dataset.go));
    });
    this.stage.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.go(1); }
    });
    // The slide. The stage's touch-action (site.css) keeps the page's own up-and-down scroll and tells the
    // world this gesture is taken (world.js ownsSwipe), so a slide here never changes side.
    let from = null;
    this.reel.addEventListener('pointerdown', (e) => { from = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    const end = (e) => {
      if (!from || e.pointerId !== from.id) return;
      const by = swipe(e.clientX - from.x, e.clientY - from.y);
      from = null;
      if (by) this.go(by);
    };
    this.reel.addEventListener('pointerup', end);
    this.reel.addEventListener('pointercancel', () => { from = null; });
    this.reel.addEventListener('dragstart', (e) => e.preventDefault());
    this.strip.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-at]');
      if (b) { this.i = Number(b.dataset.at); this.paint(0); this.onChange(this.value); }
    });
    this.ctl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'choose') { this.stepName = 'look'; this.paint(0); this.stage.focus(); }
      else if (b.dataset.act === 'back') { this.stepName = 'who'; this.paint(0); this.stage.focus(); }
      else if (b.dataset.act === 'look') { this.looks.set(this.entry.who.id, Number(b.dataset.look)); this.paint(0); this.onChange(this.value); }
    });
    this.paint(0);
  }

  get entry() { return this.entries[this.i]; }
  get look() { return this.entry.who ? this.looks.get(this.entry.who.id) ?? 0 : 0; }
  /** The icon name the form sends. */
  get value() { return this.entry.who ? castIcon(this.entry.who.id, this.look) : this.entry.pic.file; }

  /** One slide: another character, or — once one is chosen — another colour of clothes. */
  go(by) {
    const e = this.entry;
    if (this.stepName === 'look' && e.who) this.looks.set(e.who.id, step(this.look, by, e.who.looks.length));
    else this.i = step(this.i, by, this.entries.length);
    this.paint(by);
    this.onChange(this.value);
  }

  _picture(entry, look, cls, size) {
    const img = h('img', cls);
    img.alt = '';
    img.draggable = false;
    if (entry.who) { img.src = castUrl(castIcon(entry.who.id, look)); img.width = size; img.height = Math.round(size * H / W); }
    else { img.src = entry.pic.url; img.width = size; img.height = size; img.classList.add('cast-pic'); }
    return img;
  }

  paint(dir = 0) {
    const e = this.entry;
    const n = this.entries.length;
    const looking = this.stepName === 'look' && Boolean(e.who);
    if (this.stepName === 'look' && !e.who) this.stepName = 'who';
    this.root.dataset.step = looking ? 'look' : 'who';
    this.legend.textContent = looking ? `${e.who.name} — slide to change their clothes` : 'Your character — slide to choose';
    this.prev.setAttribute('aria-label', looking ? 'Previous colour' : 'Previous character');
    this.next.setAttribute('aria-label', looking ? 'Next colour' : 'Next character');

    // The reel: the one in hand, and its two neighbours waiting at the sides.
    const side = (by) => {
      if (looking) return this._picture(e, step(this.look, by, e.who.looks.length), 'cast-side', 44);
      const o = this.entries[step(this.i, by, n)];
      return this._picture(o, o.who ? this.looks.get(o.who.id) ?? 0 : 0, 'cast-side', 44);
    };
    const now = this._picture(e, this.look, 'cast-now', 88);
    if (dir) now.classList.add(dir > 0 ? 'from-right' : 'from-left');
    this.reel.replaceChildren(side(-1), now, side(1));

    this.name.replaceChildren();
    if (e.who) {
      this.name.append(h('b', '', e.who.name), h('span', 'cast-line', looking ? ` in ${LOOK_NAMES[e.who.looks[this.look]]} · ${this.look + 1} of ${e.who.looks.length}` : ` ${e.who.line}`));
    } else {
      this.name.append(h('b', '', e.pic.label || 'A picture'), h('span', 'cast-line', ' from the picture bank'));
    }
    this.stage.setAttribute('aria-label', e.who ? castLabel(this.value) : (e.pic.label || 'A picture'));

    this.ctl.replaceChildren();
    if (looking) {
      const sw = h('div', 'cast-looks');
      sw.setAttribute('role', 'group');
      sw.setAttribute('aria-label', 'Clothes');
      e.who.looks.forEach((key, k) => {
        const b = h('button', 'cast-look');
        b.type = 'button';
        b.dataset.act = 'look';
        b.dataset.look = String(k);
        b.style.setProperty('--sw', WARDROBE[key].c);
        b.style.setProperty('--sw2', WARDROBE[key].a);
        b.setAttribute('aria-label', `${LOOK_NAMES[key]}`);
        b.setAttribute('aria-pressed', String(k === this.look));
        sw.append(b);
      });
      const back = h('button', 'tg-link cast-back', 'other characters');
      back.type = 'button';
      back.dataset.act = 'back';
      this.ctl.append(sw, back);
    } else if (e.who) {
      const b = h('button', 'btn small cast-choose', `Choose ${e.who.name} and dress them`);
      b.type = 'button';
      b.dataset.act = 'choose';
      this.ctl.append(b);
    }

    this.strip.hidden = looking;
    if (!looking) {
      this.strip.replaceChildren(...this.entries.map((o, at) => {
        const b = h('button', 'cast-thumb');
        b.type = 'button';
        b.dataset.at = String(at);
        b.setAttribute('aria-label', o.who ? o.who.name : (o.pic.label || 'A picture'));
        b.setAttribute('aria-pressed', String(at === this.i));
        const img = h('img');
        img.alt = '';
        img.width = 30;
        img.height = 30;
        img.loading = 'lazy';
        img.src = o.who ? castUrl(castIcon(o.who.id, this.looks.get(o.who.id) ?? 0), { bust: true }) : o.pic.url;
        b.append(img);
        return b;
      }));
      this.strip.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }
}

export default CastPicker;
