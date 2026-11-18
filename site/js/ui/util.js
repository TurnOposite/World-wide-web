/** Small helpers shared by every page. No framework: this is all of it. */

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Tagged template that escapes interpolations unless wrapped in raw(). */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      if (v && v.__raw) out += v.html;
      else if (Array.isArray(v)) out += v.map((x) => (x && x.__raw ? x.html : esc(x))).join('');
      else out += esc(v);
    }
  });
  return { __raw: true, html: out };
}
export const raw = (s) => ({ __raw: true, html: String(s ?? '') });
export const render = (node, tpl) => { node.innerHTML = tpl.__raw ? tpl.html : esc(tpl); };

export function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** 1h39 style, for loops and spans. */
export function fmtSpan(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

/** Wall-clock time in the listener's own zone. */
export const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function toast(text, ms = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

export function coverSvg(size = 64) {
  return `<svg class="fallback" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="18" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
}

/*
 * A track the scan could not name, or that came without a cover (the mood board's MB-10, 2026-11-18). On air they
 * used to show a grey note in an empty square and « Unknown artist »; now they get a name and a cover of their own.
 */
export const UNKNOWN_ARTIST = 'Unknown artist';

/** The artist as shown: the scan's name, or for a track it could not name, a name rather than an apology. */
export function artistOf(t, lang = 'en') {
  const a = String(t?.artist ?? '').trim();
  if (a && a !== UNKNOWN_ARTIST) return a;
  return lang === 'fr' ? 'Transmission anonyme' : 'Anonymous transmission';
}

/** A barcode from a track's id: 30 bars one to three units wide, always the same bars for the same id. */
export function barsOf(id = '') {
  const s = String(id) || '0';
  let h = 2166136261;
  const out = [];
  for (let i = 0; i < 30; i++) {
    h ^= s.charCodeAt(i % s.length) + i * 7;
    h = Math.imul(h, 16777619) >>> 0;
    out.push(1 + (h % 3));
  }
  return out;
}

/** When a track started, as a camcorder burns it into the picture: Paris time, « ▶ 02:05 » over « 18 NOV 2026 ». */
export function stampOf(ms) {
  if (!Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { time: `▶ ${parts.hour}:${parts.minute}`, date: `${parts.day} ${parts.month.toUpperCase().slice(0, 3)} ${parts.year}` };
}

/** A title set on a cassette's label: words in lines of at most `width` characters, at most `max` lines, an ellipsis if cut. */
export function labelLines(title, width = 19, max = 3) {
  const words = String(title ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const word = w.length > width ? `${w.slice(0, width - 1)}…` : w;
    if (!cur) cur = word;
    else if (`${cur} ${word}`.length <= width) cur += ` ${word}`;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) { lines.length = max; lines[max - 1] = `${lines[max - 1].slice(0, width - 1)}…`; }
  return lines.length ? lines : ['—'];
}

/**
 * A cover for a track that has none: a cassette, flat and clear-cut — its title typed on the label, a barcode made from
 * its id, and the moment it started burnt into the corner like a camcorder's date. Never an empty square on air.
 */
export function blankCover(t) {
  const lines = labelLines(t?.title);
  const st = stampOf(t?.startsAt);
  let x = 12;
  const bars = barsOf(t?.id).map((w, i) => { const r = i % 2 ? '' : `<rect x="${x}" y="68" width="${w * 0.7}" height="12"/>`; x += w * 0.7 + 0.5; return r; }).join('');
  return `<svg class="blank" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <rect width="100" height="100" rx="6" fill="#1b2030"/>
    <rect x="7" y="8" width="86" height="54" rx="2" fill="#ece6d3"/>
    <rect x="7" y="8" width="86" height="9" rx="2" fill="#5aaebf"/>
    <text x="11" y="14.6" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5" font-weight="700" fill="#0c0e18" letter-spacing=".6">SIDE A · RADIO TOWER</text>
    ${lines.map((l, i) => `<text x="11" y="${26 + i * 7.4}" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="6" font-weight="600" fill="#171615">${esc(l)}</text>`).join('')}
    <rect x="28" y="47" width="44" height="12" rx="6" fill="#0c0e18"/>
    <circle cx="37" cy="53" r="4.2" fill="#d9dde6"/><circle cx="63" cy="53" r="4.2" fill="#d9dde6"/>
    <circle cx="37" cy="53" r="1.6" fill="#0c0e18"/><circle cx="63" cy="53" r="1.6" fill="#0c0e18"/>
    <g fill="#ece6d3">${bars}</g>
    <text x="12" y="86" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="3.6" fill="#8f99af" letter-spacing=".4">${esc(String(t?.id ?? '').slice(0, 16))}</text>
    ${st ? `<text x="93" y="83" text-anchor="end" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="700" fill="#ffb547">${st.time}</text>
    <text x="93" y="90" text-anchor="end" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="4.2" fill="#ffb547">${st.date}</text>` : ''}
  </svg>`;
}
