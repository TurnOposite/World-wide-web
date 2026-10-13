/**
 * The look of a cover: what the visuals take from an album's artwork
 * instead of from its genre (docs/PROGRAMME.md, "Visuals from the cover").
 *
 * Until 2026-10-14 the visualiser had one input, a hue per genre
 * (server/lib/genre.js) — and the library is almost all "Barber Beats", so
 * almost everything was violet. A cover says much more: a hue, a second hue
 * that answers it, how saturated it is, how dark. Those four numbers are
 * enough to tint every layer of the stage (public/viz.js palette()).
 *
 * Read in the listener's browser: the player already downloads the cover
 * (/api/track/:id/art), and a browser decodes JPEG for free — the tower
 * would need an image library for it (a dependency, and work for a Pi).
 * Every listener reads the same image the same way, so everyone sees the
 * same colours, the way everyone hears the same second.
 *
 * Pure: pixels in, numbers out. The caller draws the cover small (48×48 is
 * plenty — this is about the vibe, not the detail) and hands over the RGBA.
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** RGB 0..255 → { h: 0..360, s: 0..1, l: 0..1, c: chroma 0..1 }. */
export function rgbToHsl(r, g, b) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const c = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (c > 0) {
    if (max === R) h = 60 * (((G - B) / c + 6) % 6);
    else if (max === G) h = 60 * ((B - R) / c + 2);
    else h = 60 * ((R - G) / c + 4);
  }
  const s = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1));
  return { h, s: clamp01(s), l, c };
}

const BINS = 36; // 10° each

/** Circular mean of hues (degrees) with weights. */
function meanHue(pairs) {
  let x = 0;
  let y = 0;
  for (const [h, w] of pairs) {
    x += Math.cos((h * Math.PI) / 180) * w;
    y += Math.sin((h * Math.PI) / 180) * w;
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const hueGap = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/**
 * @param {Uint8ClampedArray|number[]} data   RGBA, as ImageData.data
 * @param {number} width
 * @param {number} height
 * @returns {null | {
 *   hue: number, accent: number,   degrees — the cover's main hue and the one that answers it
 *   sat: number, light: number,    0..1 — how colourful, how bright, overall
 *   mono: boolean,                 a black-and-white (or nearly) cover
 *   colors: string[]               up to five representative colours, '#rrggbb', most present first
 * }}
 */
export function coverLook(data, width, height) {
  const n = Math.min(width * height, Math.floor((data?.length || 0) / 4));
  if (!n) return null;
  const hist = new Float64Array(BINS);
  const members = Array.from({ length: BINS }, () => []);
  const boxes = new Map(); // 3 bits per channel → { n, r, g, b }
  let weightSum = 0;
  let chroma = 0;
  let light = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 128) continue;
    count++;
    const { h, l, c } = rgbToHsl(r, g, b);
    chroma += c;
    light += l;
    // What a hue is worth: its colourfulness. A big grey sky does not make
    // a cover grey if a red sun sits in it — but many grey pixels do lower
    // `sat`, below.
    if (c > 0.08) {
      const bin = Math.floor(h / (360 / BINS)) % BINS;
      hist[bin] += c;
      members[bin].push([h, c]);
      weightSum += c;
    }
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const box = boxes.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    box.n++; box.r += r; box.g += g; box.b += b;
    boxes.set(key, box);
  }
  if (!count) return null;
  const sat = clamp01((chroma / count) * 1.6);
  const lightness = light / count;

  // Smooth the hue histogram over its neighbours (it is a circle), find the peak.
  const smooth = (k) => hist[(k + BINS - 1) % BINS] * 0.5 + hist[k] + hist[(k + 1) % BINS] * 0.5;
  const peaks = [...Array(BINS).keys()].map((k) => [k, smooth(k)]).sort((x, y) => y[1] - x[1] || x[0] - y[0]);
  const around = (k) => [-1, 0, 1].flatMap((d) => members[(k + d + BINS) % BINS]);
  const mono = weightSum / count < 0.03;
  const hue = mono || !peaks[0][1] ? meanHue(around(peaks[0][0]).length ? around(peaks[0][0]) : [[220, 1]]) : meanHue(around(peaks[0][0]));
  // The answering hue: the strongest peak at least 40° away, if it weighs a
  // twelfth of the main one — a small bright sun in a big sky is exactly
  // the colour that answers it; else a neighbour of the main hue.
  const second = peaks.find(([k, w]) => w > 0 && hueGap(meanHue(around(k)), hue) >= 40 && w >= peaks[0][1] / 12);
  const accent = second ? meanHue(around(second[0])) : (hue + 30) % 360;

  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  const colors = [...boxes.values()]
    .sort((x, y) => y.n - x.n)
    .map((box) => [box.r / box.n, box.g / box.n, box.b / box.n])
    .reduce((kept, rgb) => {
      const far = kept.every((k) => Math.abs(k[0] - rgb[0]) + Math.abs(k[1] - rgb[1]) + Math.abs(k[2] - rgb[2]) > 60);
      if (far && kept.length < 5) kept.push(rgb);
      return kept;
    }, [])
    .map(([r, g, b]) => `#${hex(r)}${hex(g)}${hex(b)}`);

  const round = (v, p = 1000) => Math.round(v * p) / p;
  return { hue: round(hue, 10), accent: round(accent, 10), sat: round(sat), light: round(lightness), mono, colors };
}

export default coverLook;
