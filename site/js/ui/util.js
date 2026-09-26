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
