/**
 * Cover art for the Library's books — one motif per essay, drawn from what
 * the essay is about, so the cover that shows past a spine tells you the
 * subject before the title does. Every motif is a few lines of SVG in a
 * 100×100 box, coloured by the book's `ink` (light) and `acc` (accent).
 *
 * coverArt(id, { ink, acc }) → SVG markup. A book without a motif of its own
 * gets one by its kind of work (slides, maps, a paper).
 */

const svg = (body) => `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${body}</svg>`;

const MOTIFS = {
  // the thesis: a community as a network, around a play button
  'barber-beats-thesis': ({ ink, acc }) => {
    const n = [[50, 50], [22, 30], [78, 26], [18, 70], [82, 72], [50, 14], [50, 88], [32, 52], [68, 50], [36, 80], [66, 84], [30, 16], [74, 10]];
    const e = [[0, 7], [0, 8], [7, 1], [7, 3], [8, 2], [8, 4], [1, 5], [2, 5], [3, 9], [4, 10], [9, 6], [10, 6], [1, 11], [2, 12], [7, 9], [8, 10], [5, 11], [5, 12]];
    return svg(`<g stroke="${acc}" stroke-width=".7" opacity=".75">${e.map(([a, b]) => `<line x1="${n[a][0]}" y1="${n[a][1]}" x2="${n[b][0]}" y2="${n[b][1]}"/>`).join('')}</g>
      ${n.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 0 ? 9 : i < 9 ? 3.2 : 2}" fill="${i === 0 ? acc : ink}"/>`).join('')}
      <path d="M47 45 L56 50 L47 55 Z" fill="#171513"/>`);
  },
  'thesis-proposal': ({ ink, acc }) => svg(`<g fill="none" stroke="${ink}" stroke-width="1.6">
      <rect x="22" y="18" width="56" height="38" rx="2" opacity=".45"/><rect x="16" y="28" width="56" height="38" rx="2" opacity=".7"/></g>
      <rect x="10" y="38" width="56" height="38" rx="2" fill="${ink}"/>
      <g fill="${acc}"><rect x="18" y="62" width="6" height="8"/><rect x="28" y="56" width="6" height="14"/><rect x="38" y="50" width="6" height="20"/><rect x="48" y="58" width="6" height="12"/></g>
      <path d="M38 84 L38 92 M30 92 H46" stroke="${ink}" stroke-width="1.6"/>`),
  // a vaporwave sunset, its grid, and the co-commenting network on top
  'ucph-sna': ({ ink, acc }) => svg(`<defs><linearGradient id="cv-vw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ac6"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>
      <clipPath id="cv-vwc"><circle cx="50" cy="44" r="26"/></clipPath></defs>
      <g clip-path="url(#cv-vwc)"><rect x="20" y="16" width="60" height="60" fill="url(#cv-vw)"/>${[48, 55, 61, 66].map((y, i) => `<rect x="20" y="${y}" width="60" height="${1.6 + i * 0.7}" fill="#2b2350"/>`).join('')}</g>
      <g stroke="#6ef0ff" stroke-width=".8" opacity=".9"><path d="M0 72 H100 M0 80 H100 M0 90 H100"/>${[-60, -30, 0, 30, 60].map((d) => `<path d="M50 70 L${50 + d * 2} 100"/>`).join('')}</g>
      <g fill="${ink}"><circle cx="18" cy="22" r="2"/><circle cx="84" cy="30" r="2.4"/><circle cx="76" cy="14" r="1.6"/></g>
      <g stroke="${ink}" stroke-width=".5" opacity=".7" fill="none"><path d="M18 22 L50 44 L84 30 L76 14"/></g>`),
  'ucph-regression': ({ ink, acc }) => {
    const pts = [[18, 74], [24, 68], [27, 71], [33, 62], [38, 64], [42, 55], [47, 58], [52, 50], [56, 47], [60, 50], [65, 40], [70, 42], [74, 34], [80, 30], [84, 33], [30, 58], [62, 56], [44, 66]];
    return svg(`<path d="M12 12 V86 H90" fill="none" stroke="${ink}" stroke-width="1.4"/>
      ${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.1" fill="${ink}" opacity=".85"/>`).join('')}
      <path d="M14 78 L88 26" stroke="${acc}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M14 70 L88 34 M14 86 L88 18" stroke="${acc}" stroke-width=".6" stroke-dasharray="2 2" opacity=".7"/>`);
  },
  // pandemic Latin America: a pulse that becomes a signal
  'lacs497-digital-lifelines': ({ ink, acc }) => svg(`<path d="M6 60 H30 L36 48 L42 72 L48 30 L54 66 L58 60 H70" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      <g fill="none" stroke="${acc}" stroke-width="2.4" stroke-linecap="round"><path d="M76 52 a10 10 0 0 1 0 16"/><path d="M82 44 a20 20 0 0 1 0 32"/><path d="M88 36 a30 30 0 0 1 0 48"/></g>
      <circle cx="72" cy="60" r="3" fill="${acc}"/>`),
  // identity in quarantine: a face resolving out of pixels
  'lacs497-reinventing-identity': ({ ink, acc }) => {
    const cells = [];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) {
      const cx = 26 + x * 6;
      const cy = 18 + y * 6;
      const dx = (cx - 47) / 22;
      const dy = (cy - 46) / 28;
      if (dx * dx + dy * dy > 1) continue;
      const fade = x < 4 ? 1 : 1 - (x - 3) * 0.2;
      cells.push(`<rect x="${cx}" y="${cy}" width="5" height="5" fill="${(x + y) % 5 === 0 ? acc : ink}" opacity="${fade.toFixed(2)}"/>`);
    }
    return svg(`${cells.join('')}<g fill="${ink}" opacity=".5"><rect x="78" y="30" width="3" height="3"/><rect x="84" y="44" width="2" height="2"/><rect x="80" y="58" width="3" height="3"/></g>`);
  },
  // Malaysia: the hibiscus, and two rings bound together
  'poli369-symbiosis-of-power': ({ ink, acc }) => svg(`<g fill="${acc}">${[0, 72, 144, 216, 288].map((r) => `<path transform="rotate(${r} 50 46)" d="M50 46 C 38 30, 42 14, 50 12 C 58 14, 62 30, 50 46 Z"/>`).join('')}</g>
      <circle cx="50" cy="46" r="5" fill="${ink}"/><path d="M50 46 L60 30" stroke="${ink}" stroke-width="1.4"/><circle cx="61" cy="28.5" r="2" fill="${ink}"/>
      <g fill="none" stroke="${ink}" stroke-width="2"><circle cx="42" cy="82" r="9"/><circle cx="58" cy="82" r="9"/></g>`),
  // Brazil's compulsory vote
  'poli459-compulsory-voting': ({ ink, acc }) => svg(`<rect x="24" y="48" width="52" height="38" rx="3" fill="${ink}"/>
      <rect x="36" y="46" width="28" height="4" rx="1" fill="#1b1b1b" opacity=".6"/>
      <path d="M40 14 H62 V44 H40 Z" fill="#f6f2e8" transform="rotate(-8 51 30)"/>
      <path d="M45 26 L50 32 L60 20" fill="none" stroke="#1f8a3c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-8 51 30)"/>
      <path d="M50 62 L64 70 L50 78 L36 70 Z" fill="#f2c12e"/><circle cx="50" cy="70" r="4.5" fill="#1d4f9c"/>`),
  // liquid democracy and the pirate parties: a black sail on waves
  'poli459-liquid-democracy': ({ ink, acc }) => svg(`<path d="M52 16 V64" stroke="${ink}" stroke-width="1.8"/>
      <path d="M53 18 Q76 30 74 58 L53 58 Z" fill="#111"/><path d="M51 22 Q34 36 36 58 L51 58 Z" fill="${ink}" opacity=".85"/>
      <path d="M30 64 H74 L68 72 H36 Z" fill="${ink}"/>
      <circle cx="63" cy="38" r="3.4" fill="${ink}"/><path d="M59 45 L67 49 M67 45 L59 49" stroke="${ink}" stroke-width="1.4"/>
      <g fill="none" stroke="${acc}" stroke-width="2.2" stroke-linecap="round"><path d="M8 80 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0"/><path d="M0 90 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0"/></g>`),
  // Nicaragua and Costa Rica: one isthmus, two paths
  'poli227-nicaragua-costa-rica': ({ ink, acc }) => svg(`<path d="M18 30 L30 12 L42 30 Z" fill="${ink}"/><path d="M58 34 L72 14 L86 34 Z" fill="${acc}"/>
      <path d="M27 14 q3 -6 0 -10 M69 16 q3 -6 0 -10" stroke="${ink}" stroke-width="1" fill="none" opacity=".6"/>
      <path d="M50 92 C 50 70, 50 60, 50 56 C 46 48, 34 42, 30 36 M50 56 C 54 48, 66 44, 72 38" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M50 92 V56" stroke="${ink}" stroke-width="2.6"/><circle cx="50" cy="56" r="3.4" fill="${acc}"/>`),
  // Libya and the responsibility to protect: dunes under a shield
  'poli345-libya-r2p': ({ ink, acc }) => svg(`<path d="M50 10 L76 20 V42 C76 60, 64 70, 50 76 C36 70, 24 60, 24 42 V20 Z" fill="none" stroke="${ink}" stroke-width="2.4"/>
      <path d="M50 22 V64 M36 38 H64" stroke="${acc}" stroke-width="2"/>
      <g fill="${acc}" opacity=".85"><path d="M0 92 Q20 78 44 86 Q66 94 100 80 V100 H0 Z"/></g><path d="M0 84 Q26 72 52 80 Q76 88 100 74" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".6"/>`),
  'poli345-public-health-brazil': ({ ink, acc }) => svg(`<circle cx="50" cy="44" r="28" fill="none" stroke="${ink}" stroke-width="2"/>
      <path d="M44 26 H56 V38 H68 V50 H56 V62 H44 V50 H32 V38 H44 Z" fill="${acc}"/>
      <path d="M8 86 H36 L42 76 L48 94 L54 80 L58 86 H92" fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>`),
  // Aquinas and Aristotle: a Gothic window and its rose
  'poli334-seeking-the-common-good': ({ ink, acc }) => svg(`<path d="M26 92 V44 Q26 14 50 8 Q74 14 74 44 V92" fill="none" stroke="${ink}" stroke-width="2.4"/>
      <circle cx="50" cy="36" r="13" fill="none" stroke="${acc}" stroke-width="1.8"/>
      ${[0, 45, 90, 135].map((r) => `<path transform="rotate(${r} 50 36)" d="M50 23 V49" stroke="${acc}" stroke-width="1.2"/>`).join('')}
      <path d="M50 56 V92 M38 60 Q38 52 44 52 M62 60 Q62 52 56 52" stroke="${ink}" stroke-width="1.6" fill="none"/>
      <path d="M38 62 V92 M62 62 V92" stroke="${ink}" stroke-width="1.6"/>`),
  // Socrates and justice: a column and the scales
  'poli333-socratic-ideals': ({ ink, acc }) => svg(`<path d="M34 90 H66 M36 86 H64 M38 28 H62 M36 24 H64" stroke="${ink}" stroke-width="2.4"/>
      <g stroke="${ink}" stroke-width="1.4">${[41, 46, 50, 54, 59].map((x) => `<path d="M${x} 30 V84"/>`).join('')}</g>
      <path d="M50 8 V20 M30 14 H70" stroke="${acc}" stroke-width="1.8"/>
      <path d="M30 14 L24 26 H36 Z M70 14 L64 26 H76 Z" fill="none" stroke="${acc}" stroke-width="1.4"/>`),
  // Aristotle on freedom and slavery: the chain, one link open
  'poli333-freedom-in-natural-chains': ({ ink, acc }) => svg(`<g fill="none" stroke="${ink}" stroke-width="4">
      <rect x="14" y="40" width="24" height="14" rx="7"/><rect x="32" y="40" width="24" height="14" rx="7" transform="rotate(90 44 47)"/></g>
      <path d="M58 40 h6 a7 7 0 0 1 0 14 h-6" fill="none" stroke="${acc}" stroke-width="4"/><path d="M74 38 a7 7 0 0 1 0 14" fill="none" stroke="${acc}" stroke-width="4" transform="rotate(-24 74 45)"/>
      <path d="M20 78 Q50 96 80 78" fill="none" stroke="${acc}" stroke-width="1.4"/>${[26, 36, 46, 56, 66, 76].map((x, i) => `<ellipse cx="${x}" cy="${82 + Math.abs(i - 2.5) * -1.4 + 4}" rx="3.4" ry="1.6" transform="rotate(${i < 3 ? -30 : 30} ${x} 84)" fill="${acc}"/>`).join('')}`),
  // passport confiscation: the passport, padlocked
  'intd497-trapped-by-design': ({ ink, acc }) => svg(`<rect x="24" y="12" width="44" height="62" rx="3" fill="${ink}"/>
      <circle cx="46" cy="36" r="10" fill="none" stroke="#1b1b1b" stroke-width="1.4" opacity=".55"/><path d="M36 36 H56 M46 26 Q40 36 46 46 Q52 36 46 26" fill="none" stroke="#1b1b1b" stroke-width="1" opacity=".55"/>
      <rect x="34" y="56" width="24" height="2" fill="#1b1b1b" opacity=".4"/>
      <path d="M58 64 V56 a10 10 0 0 1 20 0 V64" fill="none" stroke="${acc}" stroke-width="3.4"/><rect x="54" y="64" width="28" height="22" rx="3" fill="${acc}"/><circle cx="68" cy="74" r="3" fill="#1b1b1b"/>`),
  // weaponised debt: a maze with a coin at its heart
  'intd497-illusion-of-choice': ({ ink, acc }) => svg(`<g fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="square">
      <path d="M14 14 H86 V86 H54 M46 86 H14 V22"/><path d="M24 24 H76 V76 H24 V34"/><path d="M34 34 H66 V66 H40 M34 66 V40"/></g>
      <circle cx="50" cy="50" r="7" fill="${acc}"/><path d="M50 45 V55 M47 47.5 H52 a2 2 0 0 1 0 4 H48" stroke="#1b1b1b" stroke-width="1.2" fill="none"/>`),
  // the power of labels: a tag on a string, and its quotation marks
  'intd350-power-of-labels': ({ ink, acc }) => svg(`<path d="M30 30 L66 18 L84 64 L48 76 Z" fill="${ink}"/><circle cx="40" cy="34" r="3.4" fill="#1b1b1b" opacity=".7"/>
      <path d="M40 34 Q20 40 14 20 Q10 8 22 6" fill="none" stroke="${ink}" stroke-width="1.2"/>
      <text x="62" y="58" font-family="Georgia,serif" font-size="30" text-anchor="middle" fill="${acc}" transform="rotate(-19 62 50)">“ ”</text>`),
  // narratives and power: two speech bubbles and a quill
  'intd350-shaping-narratives': ({ ink, acc }) => svg(`<path d="M12 18 H58 a6 6 0 0 1 6 6 V44 a6 6 0 0 1 -6 6 H30 L20 60 V50 H12 a6 6 0 0 1 -6 -6 V24 a6 6 0 0 1 6 -6 Z" fill="${ink}"/>
      <path d="M42 46 H86 a6 6 0 0 1 6 6 V70 a6 6 0 0 1 -6 6 H80 V86 L70 76 H42 a6 6 0 0 1 -6 -6 V52 a6 6 0 0 1 6 -6 Z" fill="${acc}" opacity=".95"/>
      <g fill="#1b1b1b" opacity=".45"><rect x="14" y="28" width="38" height="3"/><rect x="14" y="36" width="28" height="3"/><rect x="46" y="58" width="36" height="3"/><rect x="46" y="66" width="22" height="3"/></g>`),
  // health as a human right, Canada and HIV: the red ribbon
  'intd200-sante-droit-humain': ({ ink }) => svg(`<path d="M50 14 C 36 14, 34 34, 44 46 L 26 88 L 36 90 L 50 58 L 64 90 L 74 88 L 56 46 C 66 34, 64 14, 50 14 Z M50 24 C 56 24, 58 34, 50 42 C 42 34, 44 24, 50 24 Z" fill="#c8242f" fill-rule="evenodd"/>
      <path d="M50 14 C 36 14, 34 34, 44 46" fill="none" stroke="${ink}" stroke-width=".8" opacity=".5"/>`),
  // liberation and development: a bird leaving, in front of the rays
  'intd200-liberation-development': ({ ink, acc }) => svg(`<g stroke="${acc}" stroke-width="1.6" opacity=".8">${Array.from({ length: 11 }, (_, i) => { const a = Math.PI + (i / 10) * Math.PI; return `<path d="M50 80 L${(50 + Math.cos(a) * 46).toFixed(1)} ${(80 + Math.sin(a) * 46).toFixed(1)}"/>`; }).join('')}</g>
      <path d="M26 80 a24 24 0 0 1 48 0 Z" fill="${acc}"/>
      <path d="M30 40 Q42 30 52 40 Q62 22 80 20 Q66 30 64 42 Q58 52 46 50 Q38 48 30 40 Z" fill="${ink}"/>`),
  // the Rio ceremony and cultural cannibalism: leaves and fireworks
  'hisp320-cultural-cannibalism': ({ ink, acc }) => svg(`${[[30, 28, 14], [72, 22, 10]].map(([cx, cy, r]) => `<g stroke="${acc}" stroke-width="1.4" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${(cx + Math.cos(a) * r * 0.4).toFixed(1)} ${(cy + Math.sin(a) * r * 0.4).toFixed(1)} L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}"/>`; }).join('')}</g>`).join('')}
      <path d="M8 96 C 12 66, 30 54, 50 52 C 40 62, 34 76, 30 96 Z" fill="${ink}"/><path d="M92 96 C 88 70, 72 58, 54 56 C 62 66, 66 80, 66 96 Z" fill="${ink}" opacity=".8"/>
      <path d="M50 96 C 46 80, 48 66, 56 58 C 58 70, 56 84, 50 96 Z" fill="${acc}"/>`),
  // Tenochtitlan: a water lily on the lake, the temple behind it
  'hist223-water-lily': ({ ink, acc }) => svg(`<path d="M30 40 H70 V34 H64 V28 H58 V22 H42 V28 H36 V34 H30 Z" fill="${ink}" opacity=".55"/>
      <g fill="none" stroke="${ink}" stroke-width="1" opacity=".55"><ellipse cx="50" cy="70" rx="44" ry="12"/><ellipse cx="50" cy="70" rx="30" ry="8"/></g>
      <path d="M22 74 a14 6 0 1 0 22 -4 L34 72 Z" fill="${ink}"/><path d="M62 78 a12 5 0 1 0 18 -4 L70 76 Z" fill="${ink}" opacity=".85"/>
      ${[-36, -18, 0, 18, 36].map((r) => `<path transform="rotate(${r} 50 66)" d="M50 66 C 44 56, 46 46, 50 42 C 54 46, 56 56, 50 66 Z" fill="${acc}"/>`).join('')}`),
  // the Macuilxochitl map: a codex road of footprints
  'hist223-macuilxochitl-map': ({ ink, acc }) => svg(`<path d="M10 86 C 30 86, 26 60, 50 60 C 74 60, 70 30, 90 26" fill="none" stroke="${acc}" stroke-width="8" stroke-linecap="round" opacity=".7"/>
      ${[[16, 85, 10], [28, 80, -20], [38, 68, -40], [50, 61, 0], [62, 58, -30], [70, 46, -50], [80, 32, -30]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse rx="1.6" ry="2.6" fill="#1b1b1b"/><circle cx="-1" cy="-3.4" r=".6" fill="#1b1b1b"/><circle cx=".6" cy="-3.6" r=".6" fill="#1b1b1b"/></g>`).join('')}
      <g fill="none" stroke="${ink}" stroke-width="1.6"><rect x="12" y="14" width="16" height="16"/><circle cx="20" cy="22" r="4"/><rect x="70" y="70" width="16" height="16"/><path d="M74 82 L78 74 L82 82 Z"/></g>`),
  // anthropology and development: the village plan under the lens
  'soci254-anthropology-development': ({ ink, acc }) => svg(`<g fill="none" stroke="${ink}" stroke-width="1.2" opacity=".7"><circle cx="44" cy="44" r="30"/><circle cx="44" cy="44" r="20"/></g>
      ${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<path transform="translate(${(44 + Math.cos(a) * 25).toFixed(1)} ${(44 + Math.sin(a) * 25).toFixed(1)})" d="M-3 2 L0 -3 L3 2 Z" fill="${ink}"/>`; }).join('')}
      <circle cx="44" cy="44" r="5" fill="${acc}"/>
      <circle cx="60" cy="60" r="16" fill="none" stroke="${acc}" stroke-width="3"/><path d="M71 71 L88 88" stroke="${acc}" stroke-width="6" stroke-linecap="round"/>`),
};

const BY_KIND = {
  slides: MOTIFS['thesis-proposal'],
  maps: MOTIFS['ucph-sna'],
  paper: ({ ink, acc }) => svg(`<g fill="none" stroke="${ink}" stroke-width="1.6"><path d="M26 12 H64 L76 24 V88 H26 Z"/><path d="M64 12 V24 H76"/></g><g fill="${acc}">${[34, 42, 50, 58, 66].map((y) => `<rect x="34" y="${y}" width="${y === 66 ? 18 : 32}" height="2.4"/>`).join('')}</g>`),
};

export const hasCoverArt = (id) => Object.prototype.hasOwnProperty.call(MOTIFS, id);

export function coverArt(id, kind, colors) {
  const k = String(kind || '').toLowerCase();
  const fn = MOTIFS[id] || (/slides/.test(k) ? BY_KIND.slides : /map/.test(k) ? BY_KIND.maps : BY_KIND.paper);
  return fn(colors);
}
