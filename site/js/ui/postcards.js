/**
 * Illustrated postcards for the Atlas — one small scene per city, drawn here
 * as SVG rather than fetched as photos: no third-party host, no licence to
 * track, a few kilobytes each, and every card in the same hand.
 *
 * A place can still carry a real photo (places.json → "photo": "assets/…"):
 * the Atlas shows the photo and keeps the drawing as its fallback.
 *
 * postcardSvg(slug) returns markup for a 320×180 scene. Ids are prefixed per
 * slug so two cards on one page never share a gradient.
 */

const W = 320;
const H = 180;

/** Sky + grain + vignette, shared by every scene. `body` is drawn between them. */
function frame(id, sky, body, { grain = 0.08 } = {}) {
  const stops = sky.map((c, i) => `<stop offset="${(i / (sky.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>
    <radialGradient id="${id}-vig" cx="50%" cy="45%" r="75%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <filter id="${id}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${grain} 0"/></filter>
    <filter id="${id}-soft"><feGaussianBlur stdDeviation="1.4"/></filter>
    <filter id="${id}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>
  ${body}
  <rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>
  <rect width="${W}" height="${H}" filter="url(#${id}-grain)" opacity=".9"/>
</svg>`;
}

/** A horizontal band of water: a gradient plus shimmer lines. */
function water(id, y, top, bottom, { lines = 14, shimmer = 'rgba(255,255,255,.18)', seed = 1 } = {}) {
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const ls = [];
  for (let i = 0; i < lines; i++) {
    const yy = y + 3 + rnd() * (H - y - 4);
    const x = rnd() * W;
    const w = 6 + rnd() * 26 * (1 - (yy - y) / (H - y) * 0.4);
    ls.push(`<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${w.toFixed(1)}" height=".7" rx=".35" fill="${shimmer}"/>`);
  }
  return `<linearGradient id="${id}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
  <rect x="0" y="${y}" width="${W}" height="${H - y}" fill="url(#${id}-w)"/>${ls.join('')}`;
}

/** Mirror a group of shapes into the water below `y`, faded. */
const reflect = (svg, y, opacity = 0.32, id = '') =>
  `<g transform="translate(0 ${2 * y}) scale(1 -1)" opacity="${opacity}"${id ? ` filter="url(#${id}-soft)"` : ''}>${svg}</g>`;

/** Lit windows: a grid of tiny rectangles inside a box, some dark. */
function windows(x, y, w, h, { cols = 3, rows = 4, color = '#ffd79a', seed = 3, on = 0.6 } = {}) {
  let r = seed * 7919 + 13;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const out = [];
  const cw = w / cols;
  const rh = h / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (rnd() > on) continue;
      out.push(`<rect x="${(x + i * cw + cw * 0.28).toFixed(1)}" y="${(y + j * rh + rh * 0.25).toFixed(1)}" width="${(cw * 0.44).toFixed(1)}" height="${(rh * 0.5).toFixed(1)}" fill="${color}"/>`);
    }
  }
  return out.join('');
}

const SCENES = {
  paris(id) {
    const city = `
      <path d="M0 132 L14 132 L16 124 L30 124 L32 130 L40 130 L40 121 L46 121 L48 116 L60 116 L62 121 L70 121 L70 128 L84 128 L86 119 L92 119 L92 113 L95 113 L95 119 L104 119 L104 150 L0 150 Z" fill="#3a3152"/>
      <path d="M138 150 L138 122 L146 122 L148 116 L162 116 L164 122 L172 122 L172 112 L175 112 L175 122 L188 122 L190 117 L204 117 L206 124 L222 124 L222 118 L226 118 L226 124 L240 124 L242 120 L256 120 L258 127 L272 127 L274 121 L290 121 L292 126 L320 126 L320 150 Z" fill="#3a3152"/>
      <g fill="#ffcf8a" opacity=".8">${windows(4, 133, 34, 14, { cols: 5, rows: 2, seed: 4, on: 0.5 })}${windows(144, 124, 70, 22, { cols: 9, rows: 3, seed: 8, on: 0.45 })}${windows(232, 128, 80, 18, { cols: 10, rows: 2, seed: 2, on: 0.4 })}</g>
      <path d="M110 22 L111.3 40 L114.4 80 L118.6 80 L117.6 83 L121.5 111 L126.5 111 L126.2 114.5 L137 150 L127 150 Q110 122 93 150 L83 150 L93.8 114.5 L93.5 111 L98.5 111 L102.4 83 L101.4 80 L105.6 80 L108.7 40 Z" fill="#1d1830"/>
      <g stroke="#e9b97e" stroke-width=".6" opacity=".7"><path d="M101.6 80.5 H118.4 M93.6 111.4 H126.4"/></g>
      <circle cx="110" cy="21" r="1.4" fill="#ffe2b0"/>`;
    const bridge = `<path d="M0 150 H320 V156 H0 Z" fill="#251f38"/><g fill="#251f38"><path d="M150 156 h170 v4 h-170z"/></g>`;
    return frame(id, ['#1c2346', '#4a3d6e', '#b8687a', '#f2a46e'], `
      <circle cx="236" cy="132" r="34" fill="#ffb27a" opacity=".35" filter="url(#${id}-glow)"/>
      <circle cx="236" cy="132" r="15" fill="#ffd2a1"/>
      ${city}
      ${water(id, 156, '#5a4672', '#1b1730', { seed: 2, shimmer: 'rgba(255,200,150,.35)' })}
      ${reflect(city, 156, 0.22, id)}
      <g fill="#ffd2a1" opacity=".55">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${226 + (i % 2) * 6}" y="${160 + i * 3.2}" width="${14 - i * 1.6}" height="1" rx=".5"/>`).join('')}</g>
      ${bridge}
      <g fill="#120f20"><rect x="22" y="138" width="1.4" height="18"/><circle cx="22.7" cy="137" r="2"/><rect x="280" y="138" width="1.4" height="18"/><circle cx="280.7" cy="137" r="2"/></g>
      <g fill="#ffe6b8" opacity=".9"><circle cx="22.7" cy="137" r="1"/><circle cx="280.7" cy="137" r="1"/></g>`);
  },

  amsterdam(id) {
    // Canal houses: x, width, height, gable type, colour
    const H0 = 140;
    const spec = [
      [0, 26, 70, 'step', '#5b3a2e'], [26, 22, 82, 'bell', '#2f3b48'], [48, 28, 66, 'neck', '#6b4a37'],
      [76, 24, 88, 'step', '#3d2c2a'], [100, 30, 74, 'flat', '#4a5560'], [130, 22, 84, 'neck', '#5e3b33'],
      [152, 26, 70, 'bell', '#384452'], [178, 28, 90, 'step', '#4b342b'], [206, 22, 76, 'neck', '#2e3a44'],
      [228, 30, 68, 'flat', '#5d4436'], [258, 24, 86, 'bell', '#41312b'], [282, 38, 74, 'step', '#33404c'],
    ];
    const houses = spec.map(([x, w, h, g, c], i) => {
      const top = H0 - h;
      let roof = '';
      if (g === 'step') roof = `M${x} ${top} L${x} ${top - 4} L${x + w * 0.2} ${top - 4} L${x + w * 0.2} ${top - 9} L${x + w * 0.38} ${top - 9} L${x + w * 0.38} ${top - 14} L${x + w * 0.62} ${top - 14} L${x + w * 0.62} ${top - 9} L${x + w * 0.8} ${top - 9} L${x + w * 0.8} ${top - 4} L${x + w} ${top - 4} L${x + w} ${top} Z`;
      if (g === 'bell') roof = `M${x} ${top} Q${x + w * 0.1} ${top - 4} ${x + w * 0.22} ${top - 6} Q${x + w * 0.3} ${top - 16} ${x + w * 0.5} ${top - 18} Q${x + w * 0.7} ${top - 16} ${x + w * 0.78} ${top - 6} Q${x + w * 0.9} ${top - 4} ${x + w} ${top} Z`;
      if (g === 'neck') roof = `M${x} ${top} L${x + w * 0.25} ${top - 3} L${x + w * 0.3} ${top - 15} L${x + w * 0.7} ${top - 15} L${x + w * 0.75} ${top - 3} L${x + w} ${top} Z`;
      if (g === 'flat') roof = `M${x} ${top} L${x} ${top - 3} L${x + w} ${top - 3} L${x + w} ${top} Z`;
      return `<g><rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${c}"/><path d="${roof}" fill="${c}"/>
        <rect x="${x}" y="${top}" width="${w}" height="1.2" fill="#fff" opacity=".12"/>
        <g fill="#ffd38a">${windows(x + 2, top + 6, w - 4, h - 22, { cols: 3, rows: Math.round(h / 16), seed: i + 5, on: 0.5 })}</g>
        <rect x="${x + w * 0.38}" y="${H0 - 12}" width="${w * 0.24}" height="12" fill="#1a1414"/></g>`;
    }).join('');
    const quay = `<rect x="0" y="${H0}" width="${W}" height="6" fill="#231b1b"/>`;
    const bridge = `<path d="M196 146 Q236 122 276 146 L276 150 Q236 130 196 150 Z" fill="#1d1717"/>
      <g stroke="#1d1717" stroke-width="1.2" fill="none"><circle cx="222" cy="134" r="4"/><circle cx="233" cy="134" r="4"/><path d="M222 134 L227 128 L233 134 M227 128 L226 126"/></g>`;
    return frame(id, ['#24304e', '#5c5f86', '#c98a8f', '#efc39a'], `
      <circle cx="70" cy="56" r="10" fill="#ffe4c4" opacity=".85"/>
      ${houses}${quay}
      ${water(id, 146, '#3f3a52', '#141420', { seed: 7, shimmer: 'rgba(255,214,150,.35)' })}
      ${reflect(houses, 146, 0.25, id)}
      ${bridge}`);
  },

  copenhague(id) {
    const H0 = 132;
    const spec = [[0, 30, 64, '#e2a93b'], [30, 26, 70, '#c4533a'], [56, 30, 60, '#3f6f9a'], [86, 24, 74, '#e7c35a'], [110, 30, 62, '#b8452f'],
      [140, 28, 68, '#f0d9a8'], [168, 26, 58, '#5b8a72'], [194, 30, 72, '#d0702e'], [224, 26, 62, '#2f5e86'], [250, 30, 70, '#e3b23f'], [280, 40, 60, '#c75a42']];
    const houses = spec.map(([x, w, h, c], i) => {
      const top = H0 - h;
      return `<g><path d="M${x} ${top} L${x + w / 2} ${top - 12} L${x + w} ${top} Z" fill="#5a2c25"/>
        <rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${c}"/>
        <rect x="${x + w / 2 - 3}" y="${top - 9}" width="6" height="6" fill="#fff" opacity=".55"/>
        <g fill="#fff" opacity=".7">${windows(x + 2, top + 4, w - 4, h - 16, { cols: 3, rows: 4, seed: i + 2, on: 1, color: '#fff' })}</g>
        <g fill="#2a2a33" opacity=".55">${windows(x + 2, top + 4, w - 4, h - 16, { cols: 3, rows: 4, seed: i + 9, on: 0.25 })}</g></g>`;
    }).join('');
    const masts = [40, 96, 150, 212, 268].map((x, i) => {
      const h = 64 + (i % 2) * 14;
      return `<g stroke="#2a1f1a" stroke-width="1.1"><path d="M${x} 150 V${150 - h}"/><path d="M${x - 9} ${150 - h * 0.6} H${x + 9}" stroke-width=".8"/></g>
        <g stroke="#2a1f1a" stroke-width=".35" opacity=".7"><path d="M${x} ${150 - h} L${x - 20} 150 M${x} ${150 - h} L${x + 22} 150"/></g>
        <path d="M${x - 22} 150 Q${x} 160 ${x + 24} 150 Z" fill="#2a1f1a"/>`;
    }).join('');
    return frame(id, ['#6e9cc4', '#a9c4d8', '#f0d8b8', '#f6c896'], `
      ${houses}<rect x="0" y="${H0}" width="${W}" height="6" fill="#4b3b33"/>
      ${water(id, 138, '#4c7090', '#1d2f42', { seed: 5, shimmer: 'rgba(255,255,255,.3)' })}
      ${reflect(houses, 138, 0.3, id)}
      ${masts}`, { grain: 0.06 });
  },

  montreal(id) {
    const sky = ['#18264a', '#4c4c7e', '#b07a9c', '#f2b9a0'];
    const mountain = `<path d="M0 118 Q60 92 120 96 Q170 86 220 100 Q270 110 320 106 L320 150 L0 150 Z" fill="#2c2d52"/>`;
    const cross = `<g stroke="#fff6e0" stroke-width="1.3"><path d="M150 72 V88 M145 77 H155"/></g><circle cx="150" cy="80" r="9" fill="#fff6e0" opacity=".18" filter="url(#${id}-glow)"/>`;
    const towers = `
      <path d="M182 150 V92 L190 84 L198 92 V150 Z" fill="#232447"/>
      <rect x="202" y="98" width="20" height="52" fill="#262850"/>
      <path d="M226 150 V80 h12 V150 Z" fill="#1f2042"/><path d="M226 80 L232 70 L238 80 Z" fill="#1f2042"/>
      <rect x="242" y="104" width="22" height="46" fill="#25264c"/>
      <rect x="160" y="108" width="18" height="42" fill="#262850"/>
      <g fill="#ffd79a" opacity=".75">${windows(182, 96, 16, 50, { cols: 3, rows: 8, seed: 3, on: 0.4 })}${windows(226, 84, 12, 62, { cols: 2, rows: 10, seed: 6, on: 0.45 })}${windows(202, 100, 20, 46, { cols: 3, rows: 7, seed: 9, on: 0.4 })}</g>`;
    // the Olympic Stadium's leaning tower
    const stadium = `<path d="M10 150 Q58 118 112 150 Z" fill="#1d1e3e"/><path d="M26 150 Q60 128 96 150" stroke="#3b3d6a" stroke-width="1" fill="none"/>
      <path d="M38 150 L54 150 Q66 118 92 88 L86 82 Q56 112 38 150 Z" fill="#1d1e3e"/><path d="M82 84 L94 92 L97 86 L86 79 Z" fill="#1d1e3e"/>
      <g fill="#ffd79a" opacity=".6"><rect x="62" y="118" width="2" height="1.4"/><rect x="70" y="108" width="2" height="1.4"/><rect x="78" y="98" width="2" height="1.4"/></g>`;
    const snow = Array.from({ length: 46 }, (_, i) => {
      const x = (i * 71) % W;
      const y = (i * 37) % 150;
      return `<circle cx="${x}" cy="${y}" r="${(i % 3) * 0.3 + 0.5}" fill="#fff" opacity="${0.35 + (i % 4) * 0.12}"/>`;
    }).join('');
    return frame(id, sky, `
      <circle cx="268" cy="62" r="7" fill="#fff3dc" opacity=".9"/>
      ${mountain}${cross}${towers}${stadium}
      <path d="M0 150 Q80 142 160 148 Q240 154 320 146 L320 180 L0 180 Z" fill="#dfe6f2"/>
      <path d="M0 160 Q120 152 200 162 Q260 168 320 158 L320 180 L0 180 Z" fill="#c7d1e6"/>
      <g fill="#7d86ad" opacity=".5"><rect x="40" y="152" width="1" height="10"/><rect x="250" y="150" width="1" height="11"/></g>
      ${snow}`);
  },

  maputo(id) {
    const city = `
      <rect x="40" y="112" width="18" height="30" fill="#4a2a4a"/><rect x="60" y="104" width="14" height="38" fill="#552f52"/>
      <rect x="76" y="116" width="26" height="26" fill="#4a2a4a"/><rect x="104" y="98" width="12" height="44" fill="#5a3256"/>
      <path d="M150 142 V112 L156 104 V82 L158 70 L160 82 V104 L166 112 V142 Z" fill="#f3e2d6"/>
      <rect x="140" y="118" width="40" height="24" fill="#f0dccf"/>
      <rect x="186" y="108" width="20" height="34" fill="#552f52"/><rect x="208" y="118" width="30" height="24" fill="#4a2a4a"/>
      <rect x="240" y="100" width="14" height="42" fill="#5a3256"/><rect x="256" y="114" width="24" height="28" fill="#4a2a4a"/>
      <g fill="#ffc98a" opacity=".7">${windows(60, 106, 14, 34, { cols: 2, rows: 5, seed: 2, on: 0.5 })}${windows(186, 110, 20, 30, { cols: 3, rows: 4, seed: 4, on: 0.5 })}${windows(240, 102, 14, 38, { cols: 2, rows: 6, seed: 7, on: 0.5 })}</g>`;
    const blossom = Array.from({ length: 70 }, (_, i) => {
      const a = i * 2.39996;
      const rr = 6 + (i % 13) * 3.1;
      const cx = 28 + Math.cos(a) * rr * 1.5;
      const cy = 36 + Math.sin(a) * rr * 0.8;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(3 + (i % 4)).toFixed(1)}" fill="${['#9b6fd6', '#b58ae6', '#7d55c0', '#c7a2f0'][i % 4]}" opacity=".9"/>`;
    }).join('');
    const tree = `<path d="M0 180 Q10 120 16 90 Q22 70 40 56 M16 96 Q34 84 60 76 M14 110 Q4 92 0 84" stroke="#1d1120" stroke-width="5" fill="none" stroke-linecap="round"/>${blossom}`;
    return frame(id, ['#2a1c40', '#7a3a6e', '#d4677a', '#f7b46a'], `
      <circle cx="210" cy="96" r="40" fill="#ffb070" opacity=".35" filter="url(#${id}-glow)"/>
      <circle cx="210" cy="98" r="16" fill="#ffd9a0"/>
      ${city}
      ${water(id, 142, '#a2507a', '#2a1838', { seed: 3, shimmer: 'rgba(255,210,160,.45)' })}
      ${reflect(city, 142, 0.25, id)}
      <g fill="#ffd9a0" opacity=".6">${[0, 1, 2, 3, 4].map((i) => `<rect x="${200 + (i % 2) * 5}" y="${146 + i * 6}" width="${16 - i * 2}" height="1.2" rx=".6"/>`).join('')}</g>
      <path d="M268 150 L286 150 L284 155 L270 155 Z" fill="#1d1120"/><path d="M277 150 L277 128 L292 148 Z" fill="#f5e6da" opacity=".85"/>
      ${tree}`);
  },

  vilanculos(id) {
    const dhow = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-14 0 L14 0 L10 5 L-10 5 Z" fill="#3a2a22"/><path d="M-2 0 L-1 -30 L18 -3 Z" fill="#fbf6ec"/><path d="M-1 -30 L-16 -2" stroke="#3a2a22" stroke-width=".8"/></g>`;
    return frame(id, ['#58b8e0', '#a9dcec', '#e9f6f2'], `
      <circle cx="262" cy="38" r="22" fill="#fff" opacity=".35" filter="url(#${id}-glow)"/><circle cx="262" cy="38" r="9" fill="#fffbe8"/>
      <path d="M150 104 Q200 92 250 100 Q290 104 320 100 L320 108 L150 108 Z" fill="#f2e3c0"/>
      <path d="M180 104 Q230 96 290 104 Z" fill="#d9c08f" opacity=".6"/>
      ${water(id, 106, '#2bc4c0', '#0b6f86', { seed: 4, shimmer: 'rgba(255,255,255,.55)', lines: 22 })}
      <path d="M0 132 Q60 122 120 128 Q170 134 200 128 L200 136 Q120 140 0 140 Z" fill="#9de6dc" opacity=".55"/>
      ${dhow(96, 118, 1)}${dhow(170, 112, 0.7)}${dhow(230, 120, 0.55)}
      <path d="M0 150 Q80 140 160 150 Q240 160 320 148 L320 180 L0 180 Z" fill="#f6e6c4"/>
      <path d="M296 180 Q300 130 286 88" stroke="#3b2d1f" stroke-width="3.5" fill="none"/>
      <g fill="#2d5a3a">${[[-40, 8], [-12, -6], [20, -2], [44, 12], [-30, 26], [32, 30]].map(([dx, dy]) => `<path d="M286 88 Q${286 + dx / 2} ${80 + dy / 2} ${286 + dx} ${88 + dy} Q${286 + dx / 2} ${86 + dy / 2} 286 90 Z"/>`).join('')}</g>`, { grain: 0.05 });
  },

  'novo-hamburgo'(id) {
    // Araucarias: the candelabra pine of the Serra Gaúcha, the region's signature.
    const arau = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"><rect x="-.8" y="-40" width="1.6" height="40"/>
      <path d="M-18 -40 Q-10 -46 0 -44 Q10 -46 18 -40 Q10 -42 0 -40 Q-10 -42 -18 -40 Z"/><path d="M-14 -33 Q-7 -38 0 -36 Q7 -38 14 -33 Q7 -35 0 -33 Q-7 -35 -14 -33 Z"/>
      <path d="M-22 -46 Q-12 -54 0 -51 Q12 -54 22 -46 Q12 -49 0 -47 Q-12 -49 -22 -46 Z"/></g>`;
    const house = `<g transform="translate(196 120)">
      <path d="M-6 2 L36 -26 L78 2 Z" fill="#8c3b2a"/>
      <rect x="0" y="0" width="72" height="38" fill="#efe6d6"/>
      <g stroke="#3b2a22" stroke-width="2.2" fill="none"><rect x="0" y="0" width="72" height="38"/><path d="M24 0 V38 M48 0 V38 M0 19 H72 M0 0 L24 19 M24 0 L0 19 M48 19 L72 38 M72 19 L48 38"/></g>
      <rect x="30" y="22" width="12" height="16" fill="#3b2a22"/><g fill="#7da2b8"><rect x="6" y="5" width="10" height="9"/><rect x="56" y="5" width="10" height="9"/><rect x="56" y="24" width="10" height="9"/></g></g>`;
    const church = `<g fill="#55637a"><rect x="110" y="86" width="16" height="44"/><path d="M110 86 L118 52 L126 86 Z"/><rect x="117.4" y="44" width="1.2" height="9"/><rect x="115" y="47" width="6" height="1.2"/><rect x="96" y="104" width="40" height="26"/></g>`;
    return frame(id, ['#a9bccb', '#d6dcd8', '#efe2c8'], `
      <circle cx="78" cy="56" r="24" fill="#fff6dc" opacity=".55" filter="url(#${id}-glow)"/><circle cx="78" cy="56" r="10" fill="#fff4d8"/>
      <path d="M0 108 Q60 88 130 98 Q200 84 320 96 L320 140 L0 140 Z" fill="#8fa39a"/>
      ${arau(30, 104, 0.8, '#7b9188')}${arau(60, 100, 0.6, '#7b9188')}${arau(150, 96, 0.7, '#7b9188')}${arau(286, 98, 0.75, '#7b9188')}
      <rect x="0" y="96" width="${W}" height="20" fill="#e9e6dc" opacity=".35" filter="url(#${id}-soft)"/>
      ${church}
      <path d="M0 128 Q90 116 170 126 Q250 136 320 122 L320 180 L0 180 Z" fill="#5d7563"/>
      ${arau(22, 150, 1.25, '#2f4236')}${arau(88, 146, 1, '#34493c')}${arau(300, 152, 1.3, '#2f4236')}
      ${house}
      <path d="M0 160 Q160 150 320 162 L320 180 L0 180 Z" fill="#435a49"/>`, { grain: 0.07 });
  },

  'kuala-lumpur'(id) {
    // Twin towers: stacked, tapering tiers with a spire; joined by the skybridge.
    const tower = (cx) => {
      const tiers = [[150, 14], [118, 12.5], [96, 11], [80, 9.5], [68, 8], [60, 6.5], [54, 5], [50, 3.5]];
      let d = '';
      for (let i = 0; i < tiers.length - 1; i++) {
        const [y1, w1] = tiers[i];
        const [y2] = tiers[i + 1];
        d += `M${cx - w1} ${y1} L${cx - w1} ${y2} L${cx + w1} ${y2} L${cx + w1} ${y1} Z `;
      }
      return `<path d="${d}" fill="url(#${id}-steel)"/><path d="M${cx - 1} 50 L${cx} 20 L${cx + 1} 50 Z" fill="#dfe2f2"/>
        <g stroke="#ffffff" stroke-width=".35" opacity=".35">${Array.from({ length: 24 }, (_, i) => `<path d="M${cx - 10} ${148 - i * 4} H${cx + 10}"/>`).join('')}</g>`;
    };
    const kltower = `<g fill="#2b2650"><rect x="262" y="70" width="4" height="80"/><path d="M256 70 Q264 58 272 70 Q264 76 256 70 Z"/><rect x="263.4" y="40" width="1.2" height="22"/></g><circle cx="264" cy="66" r="2" fill="#ff8fc8" opacity=".9"/>`;
    const city = `<g fill="#1c1a3c"><rect x="0" y="122" width="40" height="40"/><rect x="40" y="110" width="22" height="50"/><rect x="62" y="128" width="30" height="40"/><rect x="172" y="116" width="26" height="50"/><rect x="198" y="126" width="34" height="40"/><rect x="232" y="112" width="20" height="50"/><rect x="276" y="120" width="44" height="50"/></g>
      <g fill="#ffd79a" opacity=".6">${windows(0, 124, 40, 30, { cols: 6, rows: 4, seed: 1, on: 0.35 })}${windows(172, 118, 26, 36, { cols: 4, rows: 5, seed: 2, on: 0.35 })}${windows(276, 122, 44, 30, { cols: 6, rows: 4, seed: 5, on: 0.35 })}</g>`;
    const stars = Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 83) % W}" cy="${(i * 29) % 70}" r="${i % 3 ? 0.5 : 0.9}" fill="#fff" opacity="${0.3 + (i % 5) * 0.12}"/>`).join('');
    const fronds = `<g fill="#090816">${[[-60, -10], [-30, -40], [10, -46], [44, -20], [60, 12]].map(([dx, dy]) => `<path d="M20 180 Q${20 + dx / 2} ${150 + dy / 2} ${20 + dx} ${150 + dy} Q${20 + dx / 2} ${156 + dy / 2} 22 180 Z"/>`).join('')}</g>`;
    return frame(id, ['#0f0c2a', '#2f1b55', '#7a2f72', '#d0568a'], `
      <defs><linearGradient id="${id}-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f93b8"/><stop offset=".45" stop-color="#e7e9f6"/><stop offset="1" stop-color="#6b6f96"/></linearGradient></defs>
      ${stars}
      <circle cx="150" cy="110" r="70" fill="#ff7ab8" opacity=".18" filter="url(#${id}-glow)"/>
      ${city}${tower(132)}${tower(168)}
      <rect x="145" y="94" width="10" height="2" fill="#d5d8ea"/><path d="M146 96 L150 101 L154 96" stroke="#b9bdd6" stroke-width=".5" fill="none" opacity=".8"/>
      ${kltower}
      <rect x="0" y="160" width="${W}" height="20" fill="#0c0a1e"/>
      ${fronds}<g transform="translate(320 0) scale(-1 1)">${fronds}</g>`);
  },

  stockholm(id) {
    const H0 = 128;
    const spec = [[60, 18, 50, '#d39a4a'], [78, 16, 56, '#b5523a'], [94, 20, 46, '#e3c06a'], [114, 16, 54, '#c77a3e'], [130, 22, 48, '#9e4a35'],
      [152, 16, 58, '#e0b45a'], [168, 20, 50, '#c26843'], [188, 18, 44, '#d8a556']];
    const oldtown = spec.map(([x, w, h, c], i) => {
      const top = H0 - h;
      return `<g><path d="M${x} ${top} L${x + w / 2} ${top - 10} L${x + w} ${top} Z" fill="#3e2a2a"/><rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${c}"/>
        <g fill="#3b2a24" opacity=".45">${windows(x + 1, top + 4, w - 2, h - 8, { cols: 3, rows: 5, seed: i + 3, on: 0.9 })}</g></g>`;
    }).join('');
    // Riddarholmen's open iron spire, and the City Hall tower with its three crowns.
    const spire = `<g fill="#2a2f45"><rect x="210" y="84" width="20" height="44"/><path d="M212 84 L220 30 L228 84 Z"/></g><g stroke="#a9b3cf" stroke-width=".4" opacity=".6"><path d="M214 80 L220 40 L226 80 M215 70 H225 M216.5 60 H223.5 M218 50 H222"/></g>`;
    const cityhall = `<g fill="#3a2c38"><rect x="20" y="58" width="16" height="70"/><rect x="18" y="56" width="20" height="4"/><path d="M22 56 L28 44 L34 56 Z"/><rect x="0" y="96" width="60" height="32"/></g>
      <g fill="#f1c45a"><circle cx="24" cy="42" r="1.4"/><circle cx="28" cy="40" r="1.6"/><circle cx="32" cy="42" r="1.4"/></g>`;
    const all = cityhall + oldtown + spire + `<rect x="236" y="100" width="84" height="28" fill="#4a3a3e"/><rect x="250" y="88" width="30" height="12" fill="#4a3a3e"/>`;
    return frame(id, ['#20305a', '#5a6c9c', '#c79aa8', '#f4c898'], `
      <circle cx="280" cy="70" r="26" fill="#ffc890" opacity=".35" filter="url(#${id}-glow)"/><circle cx="280" cy="72" r="9" fill="#ffe0b8"/>
      ${all}<rect x="0" y="${H0}" width="${W}" height="5" fill="#2b2230"/>
      ${water(id, 133, '#4a5582', '#141a30', { seed: 9, shimmer: 'rgba(255,220,180,.35)' })}
      ${reflect(all, 133, 0.28, id)}
      <path d="M120 156 L170 156 L164 162 L126 162 Z" fill="#141626"/><rect x="134" y="150" width="22" height="6" fill="#e8e2d6"/><rect x="142" y="140" width="1.2" height="10" fill="#141626"/>`);
  },

  geneve(id) {
    const alps = `<path d="M0 104 L30 86 L52 96 L84 70 L104 84 L132 58 L150 72 L170 62 L196 82 L222 66 L250 88 L284 74 L320 92 L320 120 L0 120 Z" fill="#9fb3c9"/>
      ${[[84, 70, 0.7, 0.7], [132, 58, 0.93, 0.78], [170, 62, 0.4, 0.77], [222, 66, 1, 0.8]].map(([x, y, l, r]) => `<path d="M${x} ${y} L${x - 11} ${y + 11 * l} L${x - 6} ${y + 7} L${x - 2} ${y + 10} L${x + 3} ${y + 6} L${x + 7} ${y + 9} L${x + 11} ${y + 11 * r} Z" fill="#fbfdff"/>`).join('')}`;
    const hills = `<path d="M0 118 Q80 104 160 112 Q240 120 320 110 L320 128 L0 128 Z" fill="#5f7f74"/>`;
    // The old town on its hill, with the cathedral's green spire.
    const town = `<g fill="#6f6466"><rect x="196" y="104" width="12" height="24"/><rect x="214" y="104" width="12" height="24"/><path d="M196 104 L202 98 L208 104 Z M214 104 L220 98 L226 104 Z"/>
      <rect x="182" y="114" width="70" height="14"/></g><path d="M206.5 104 L211 84 L215.5 104 Z" fill="#5f9c88"/>
      <g fill="#8a7c7c"><rect x="140" y="116" width="40" height="12"/><rect x="254" y="118" width="40" height="10"/></g>`;
    const jet = `<path d="M96 128 C 95 100, 98 60, 102 30 C 104 60, 101 100, 100 128 Z" fill="url(#${id}-jet)"/>
      <ellipse cx="104" cy="34" rx="10" ry="6" fill="#fff" opacity=".45" filter="url(#${id}-soft)"/><path d="M102 32 Q114 40 118 70" stroke="#fff" stroke-width="3" opacity=".25" fill="none" filter="url(#${id}-soft)"/>`;
    const sails = [[150, 150], [236, 144], [40, 156]].map(([x, y], i) => `<g transform="translate(${x} ${y}) scale(${1 - i * 0.15})"><path d="M-8 0 H8 L6 3 H-6 Z" fill="#2a3a4a"/><path d="M0 0 V-18 L9 -1 Z" fill="#fff"/><path d="M-1 -16 L-8 -1 H-1 Z" fill="#e7eef6"/></g>`).join('');
    return frame(id, ['#7fb6e0', '#bcd9ec', '#eef5f6'], `
      <defs><linearGradient id="${id}-jet" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient></defs>
      ${alps}${hills}${town}
      ${water(id, 128, '#4f97c2', '#1d5a80', { seed: 6, shimmer: 'rgba(255,255,255,.5)', lines: 20 })}
      ${jet}
      <path d="M60 132 L104 128 L106 130 L60 134 Z" fill="#e7e2d6"/>
      ${sails}`, { grain: 0.05 });
  },
};

/** Pastel fallback for a place without a drawing yet: sky, horizon, a pin. */
function generic(id) {
  return frame(id, ['#20304a', '#4d5b7e', '#a7a9b8'], `<path d="M0 130 Q80 116 160 124 Q240 132 320 120 L320 180 L0 180 Z" fill="#26324a"/>
    <circle cx="160" cy="96" r="7" fill="#34d399"/><circle cx="160" cy="96" r="16" fill="none" stroke="#34d399" stroke-width="1.2" opacity=".5"/>`);
}

export const hasPostcard = (slug) => Object.prototype.hasOwnProperty.call(SCENES, slug);

export function postcardSvg(slug) {
  const id = `pc-${String(slug).replace(/[^a-z0-9-]/gi, '')}`;
  return (SCENES[slug] || generic)(id);
}
