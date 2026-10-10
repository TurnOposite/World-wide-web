/**
 * The pond on /ecrits: the texts lie on its floor, engraved on flat stones,
 * under water too dark to read. Moving over the surface stirs it — ripples
 * spread, and where the hand passed the water clears and the stones show —
 * then the pond slowly settles and goes opaque again.
 *
 * Two fields, simulated here in plain JS on a coarse grid (a quarter of the
 * CSS pixels): `height`, the classic two-buffer ripple equation, and
 * `clarity`, raised by the pointer and decaying back to murk. Every frame both
 * go to the GPU as one small texture; a fragment shader bends the floor
 * (refraction from the height field's slope), mixes it with the murky surface
 * by clarity, and adds the glint of a light on the ripples. The floor itself
 * is painted once with Canvas 2D (silt, pebbles, weed, the stones and their
 * titles) and uploaded as a texture.
 *
 * The links are real <a> elements laid over their stones: keyboard, screen
 * readers and plain clicks never depend on the water. Without WebGL, or with
 * reduced motion, the floor is shown still and clear.
 *
 * createPond(host, items) → { destroy() }. items: [{ href, title, meta, scored }]
 */

const GRID = 4;          // CSS px per simulation cell
const DAMP = 0.982;      // ripple energy kept per step
const CLEAR_KEEP = 0.9925; // clarity kept per step (≈ 3 s half-life at 60 fps)
const BASE_SEEN = 0.05;  // how much of the floor shows through still water

const VERT = `attribute vec2 p; varying vec2 vUv;
void main(){ vUv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `precision mediump float;
varying vec2 vUv;
uniform sampler2D uFloor; uniform sampler2D uField;
uniform vec2 uTexel; uniform float uSeen; uniform float uTime; uniform vec2 uAspect;
void main(){
  float hl = texture2D(uField, vUv - vec2(uTexel.x, 0.)).r;
  float hr = texture2D(uField, vUv + vec2(uTexel.x, 0.)).r;
  float hu = texture2D(uField, vUv - vec2(0., uTexel.y)).r;
  float hd = texture2D(uField, vUv + vec2(0., uTexel.y)).r;
  vec2 g = vec2(hr - hl, hd - hu) * 3.2;
  vec3 n = normalize(vec3(-g, 1.));
  float clar = texture2D(uField, vUv).g;

  vec2 ruv = vUv + n.xy * vec2(.010, .010 * uAspect.x / uAspect.y);
  vec3 floorC = texture2D(uFloor, ruv).rgb;
  // light that reaches the floor gathers where the surface curves: cheap caustics
  float caus = clamp(1. + (hl + hr + hu + hd - 2.) * 2.6, .8, 1.3);
  // seen through water: darker, greener, a little hazy
  vec3 seen = mix(floorC * vec3(.72, .86, .82) * caus, vec3(.05, .12, .11), .12);

  // the surface itself: dark water, a faint sky, a moving sheen
  vec3 murk = mix(vec3(.018, .045, .046), vec3(.034, .078, .072), vUv.y);
  float sheen = .5 + .5 * sin((vUv.x * 3.1 + vUv.y * 1.7) * 3.14 + uTime * .12);
  murk += vec3(.006, .014, .014) * sheen;

  float c = clamp(uSeen + clar * (1. - uSeen), 0., 1.);
  c = c * c * (3. - 2. * c);
  vec3 col = mix(murk, seen, c);

  vec3 L = normalize(vec3(-.35, -.55, .76));
  float spec = pow(max(dot(reflect(-L, n), vec3(0., 0., 1.)), 0.), 90.);
  col += spec * vec3(.75, .9, .88) * (.35 + .65 * (1. - c));
  col += length(g) * vec3(.05, .09, .085);
  // the rim: the bank's shadow on the water
  vec2 e = min(vUv, 1. - vUv) * uAspect / min(uAspect.x, uAspect.y);
  float rim = smoothstep(0., .07, min(e.x, e.y));
  col *= mix(.45, 1., rim);
  gl_FragColor = vec4(col, 1.);
}`;

/** Deterministic noise, so the pond floor is the same on every visit. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Where the stones lie, as fractions of the pond: scattered, never in a grid. */
function layout(n, w, h) {
  const portrait = w < 620;
  const spots = portrait
    ? [[0.3, 0.13], [0.7, 0.27], [0.32, 0.43], [0.7, 0.58], [0.3, 0.74], [0.68, 0.88]]
    : [[0.17, 0.3], [0.45, 0.2], [0.78, 0.3], [0.25, 0.73], [0.55, 0.62], [0.83, 0.74]];
  const r = rng(7);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [fx, fy] = spots[i % spots.length];
    const sw = portrait ? Math.min(150, w * 0.42) : Math.max(170, Math.min(232, w * 0.2));
    out.push({ x: fx * w + (r() - 0.5) * 18, y: fy * h + (r() - 0.5) * 14, w: sw, h: sw * 0.6, rot: (r() - 0.5) * 0.26 });
  }
  return out;
}

/** Paint the pond floor: silt, pebbles, weed, and the stones with their titles. */
function paintFloor(cv, w, h, dpr, stones, items) {
  const g = cv.getContext('2d');
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = rng(42);

  const base = g.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  base.addColorStop(0, '#3f4a3a');
  base.addColorStop(0.55, '#33392c');
  base.addColorStop(1, '#1d2219');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // silt: soft blotches
  for (let i = 0; i < 70; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 30 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() > 0.5;
    gr.addColorStop(0, light ? 'rgba(120,118,92,.16)' : 'rgba(10,16,12,.22)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // grains
  for (let i = 0; i < (w * h) / 90; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(200,190,150,.07)' : 'rgba(0,0,0,.12)';
    g.fillRect(r() * w, r() * h, 1 + r(), 1 + r());
  }
  // pebbles
  const pebble = (x, y, rx, ry, rot, tone) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(rx * 0.12, ry * 0.25, rx, ry, 0, 0, Math.PI * 2); g.fill();
    const pg = g.createLinearGradient(-rx, -ry, rx, ry);
    pg.addColorStop(0, `hsl(${tone[0]} ${tone[1]}% ${tone[2] + 10}%)`);
    pg.addColorStop(1, `hsl(${tone[0]} ${tone[1]}% ${tone[2] - 8}%)`);
    g.fillStyle = pg;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  for (let i = 0; i < (w * h) / 2600; i++) {
    const x = r() * w;
    const y = r() * h;
    if (stones.some((s) => Math.hypot((x - s.x) / (s.w * 0.62), (y - s.y) / (s.h * 0.66)) < 1)) continue;
    const s = 2 + r() * r() * 11;
    pebble(x, y, s, s * (0.55 + r() * 0.4), r() * Math.PI, [30 + r() * 40, 8 + r() * 14, 26 + r() * 22]);
  }
  // weed: long strands bending one way, as if there were a slight current
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = h * (0.15 + r() * 0.85);
    if (stones.some((s) => Math.hypot((x - s.x) / (s.w * 0.7), (y - s.y) / (s.h * 0.8)) < 1)) continue;
    const len = 30 + r() * 70;
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = `rgba(${40 + r() * 30},${70 + r() * 40},${40 + r() * 20},${0.45 + r() * 0.3})`;
      g.lineWidth = 1.2 + r() * 1.6;
      g.beginPath();
      g.moveTo(x + k * 3, y);
      g.bezierCurveTo(x + k * 3 + 10, y - len * 0.4, x + k * 3 - 6 + r() * 20, y - len * 0.7, x + k * 3 + 14 + r() * 14, y - len);
      g.stroke();
    }
  }

  // the stones that carry the texts
  const serif = '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif';
  const sans = '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif';
  stones.forEach((s, i) => {
    const it = items[i];
    const tone = [[38, 10, 74], [28, 12, 70], [190, 6, 72], [45, 14, 76], [20, 8, 68], [60, 6, 73]][i % 6];
    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.rot);
    // the stone's shadow in the silt
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(6, 9, s.w / 2, s.h / 2, 0, 0, Math.PI * 2); g.fill();
    // an irregular, flat river stone
    g.beginPath();
    const steps = 28;
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 3 + i) * 0.035 + Math.sin(a * 5 + i * 2) * 0.02;
      const px = Math.cos(a) * (s.w / 2) * wob;
      const py = Math.sin(a) * (s.h / 2) * wob;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    const sg = g.createRadialGradient(-s.w * 0.18, -s.h * 0.3, s.h * 0.1, 0, 0, s.w * 0.6);
    sg.addColorStop(0, `hsl(${tone[0]} ${tone[1]}% ${tone[2] + 8}%)`);
    sg.addColorStop(0.7, `hsl(${tone[0]} ${tone[1]}% ${tone[2]}%)`);
    sg.addColorStop(1, `hsl(${tone[0]} ${tone[1]}% ${tone[2] - 16}%)`);
    g.fillStyle = sg;
    g.fill();
    g.save();
    g.clip();
    for (let k = 0; k < 140; k++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)';
      g.fillRect((r() - 0.5) * s.w, (r() - 0.5) * s.h, 1.5, 1.5);
    }
    // a little algae on the lower edge
    const al = g.createLinearGradient(0, s.h * 0.1, 0, s.h * 0.5);
    al.addColorStop(0, 'rgba(60,90,50,0)');
    al.addColorStop(1, 'rgba(60,90,50,.35)');
    g.fillStyle = al;
    g.fillRect(-s.w / 2, 0, s.w, s.h / 2);
    g.restore();

    // engraved title: dark cut, light lip below
    let size = Math.round(s.w * 0.12);
    g.font = `600 ${size}px ${serif}`;
    while (g.measureText(it.title).width > s.w * 0.78 && size > 12) { size -= 1; g.font = `600 ${size}px ${serif}`; }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.fillText(it.title, 0, -s.h * 0.06 + 1.2);
    g.fillStyle = 'rgba(38,34,28,.88)';
    g.fillText(it.title, 0, -s.h * 0.06);
    g.font = `600 ${Math.max(10, Math.round(size * 0.48))}px ${sans}`;
    g.fillStyle = 'rgba(58,52,42,.78)';
    g.fillText(it.meta, 0, s.h * 0.2);
    if (it.scored) {
      g.fillStyle = 'rgba(40,90,110,.85)';
      g.font = `700 ${Math.round(size * 0.7)}px ${sans}`;
      g.fillText('♦', s.w * 0.36, -s.h * 0.24);
    }
    g.restore();
  });
}

function makeGl(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  } catch { gl = null; }
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = (unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const floorTex = tex(0);
    const fieldTex = tex(1);
    const u = (n) => gl.getUniformLocation(prog, n);
    gl.uniform1i(u('uFloor'), 0);
    gl.uniform1i(u('uField'), 1);
    return { gl, floorTex, fieldTex, uTexel: u('uTexel'), uSeen: u('uSeen'), uTime: u('uTime'), uAspect: u('uAspect') };
  } catch (err) {
    console.warn('[pond] WebGL unavailable, showing the floor still:', err.message);
    return null;
  }
}

export function createPond(host, items, { reducedMotion = false } = {}) {
  host.classList.add('pond');
  host.innerHTML = `<canvas class="pond-water" aria-hidden="true"></canvas>
    <div class="pond-links">${items.map((it, i) => `<a class="text-card stone" href="${it.href}" data-link data-i="${i}">
      <span class="sr">${it.label}</span></a>`).join('')}</div>`;
  const canvas = host.querySelector('.pond-water');
  const links = [...host.querySelectorAll('.stone')];
  const floor = document.createElement('canvas');

  let W = 0; let H = 0; let cols = 0; let rows = 0;
  let cur = null; let prev = null; let clear = null; let bytes = null;
  let stones = [];
  let raf = 0; let visible = true; let running = false; let destroyed = false;
  let lastT = 0; let nextDrip = 0; let t0 = performance.now();
  let pointer = null;

  const ctx = reducedMotion ? null : makeGl(canvas);
  host.classList.toggle('still', !ctx);

  function size() {
    const r = host.getBoundingClientRect();
    W = Math.max(200, Math.round(r.width));
    H = Math.max(200, Math.round(r.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    stones = layout(items.length, W, H);
    links.forEach((a, i) => {
      const s = stones[i];
      a.style.left = `${s.x - s.w / 2}px`;
      a.style.top = `${s.y - s.h / 2}px`;
      a.style.width = `${s.w}px`;
      a.style.height = `${s.h}px`;
      a.style.transform = `rotate(${s.rot}rad)`;
    });
    paintFloor(floor, W, H, dpr, stones, items);
    if (!ctx) {
      // still water: the floor itself, darkened at the rim (css does the rest)
      canvas.width = floor.width;
      canvas.height = floor.height;
      canvas.getContext('2d').drawImage(floor, 0, 0);
      return;
    }
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cols = Math.ceil(W / GRID) + 2;
    rows = Math.ceil(H / GRID) + 2;
    cur = new Float32Array(cols * rows);
    prev = new Float32Array(cols * rows);
    clear = new Float32Array(cols * rows);
    bytes = new Uint8Array(cols * rows * 4);
    const { gl } = ctx;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ctx.floorTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, floor);
    gl.uniform2f(ctx.uTexel, 1 / cols, 1 / rows);
    gl.uniform2f(ctx.uAspect, W, H);
    gl.uniform1f(ctx.uSeen, BASE_SEEN);
  }

  /** Disturb the water at (x, y) CSS px: a dent of `amp`, and clear it over `radius`. */
  function stir(x, y, amp, radius, clearAmt) {
    if (!cur) return;
    const cx = x / GRID + 1;
    const cy = y / GRID + 1;
    const rr = 2.2;
    for (let j = Math.floor(cy - rr); j <= Math.ceil(cy + rr); j++) {
      for (let i = Math.floor(cx - rr); i <= Math.ceil(cx + rr); i++) {
        if (i < 1 || j < 1 || i >= cols - 1 || j >= rows - 1) continue;
        const d = Math.hypot(i - cx, j - cy) / rr;
        if (d < 1) cur[j * cols + i] -= amp * (1 - d * d);
      }
    }
    if (!clearAmt) return;
    const R = radius / GRID;
    for (let j = Math.floor(cy - R); j <= Math.ceil(cy + R); j++) {
      for (let i = Math.floor(cx - R); i <= Math.ceil(cx + R); i++) {
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const d2 = ((i - cx) ** 2 + (j - cy) ** 2) / (R * R);
        if (d2 >= 1) continue;
        const k = (1 - d2) * (1 - d2);
        const n = j * cols + i;
        clear[n] = Math.min(1, clear[n] + clearAmt * k);
      }
    }
  }

  function step() {
    const c = cur; const p = prev;
    for (let j = 1; j < rows - 1; j++) {
      const row = j * cols;
      for (let i = 1; i < cols - 1; i++) {
        const n = row + i;
        p[n] = ((c[n - 1] + c[n + 1] + c[n - cols] + c[n + cols]) * 0.5 - p[n]) * DAMP;
      }
    }
    prev = c;
    cur = p;
    for (let n = 0; n < clear.length; n++) {
      const v = clear[n];
      if (v > 0) clear[n] = v > 0.0006 ? v * CLEAR_KEEP - 0.0003 : 0;
    }
  }

  function draw(now) {
    const { gl } = ctx;
    for (let n = 0, b = 0; n < cur.length; n++, b += 4) {
      let h = 128 + cur[n] * 60;
      bytes[b] = h < 0 ? 0 : h > 255 ? 255 : h;
      bytes[b + 1] = clear[n] * 255;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ctx.fieldTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.uniform1f(ctx.uTime, (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function frame(now) {
    raf = 0;
    if (destroyed || !visible) { running = false; return; }
    const dt = lastT ? Math.min(64, now - lastT) : 16;
    lastT = now;
    // a drop now and then, so still water is never dead water
    if (now > nextDrip) {
      stir(Math.random() * W, Math.random() * H, 0.6 + Math.random() * 0.5, 0, 0);
      nextDrip = now + 1400 + Math.random() * 2600;
    }
    const steps = dt > 26 ? 2 : 1;
    for (let k = 0; k < steps; k++) step();
    draw(now);
    raf = requestAnimationFrame(frame);
    running = true;
  }
  const start = () => { if (ctx && !running && !destroyed && visible) { running = true; lastT = 0; raf = requestAnimationFrame(frame); } };

  // ------------------------------------------------------------ the hand --
  const local = (e) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function onMove(e) {
    if (!ctx) return;
    const p = local(e);
    const now = performance.now();
    if (pointer) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.hypot(dx, dy);
      const speed = dist / Math.max(8, now - pointer.t);
      const n = Math.max(1, Math.ceil(dist / 7));
      for (let k = 1; k <= n; k++) {
        const x = pointer.x + (dx * k) / n;
        const y = pointer.y + (dy * k) / n;
        stir(x, y, Math.min(1.6, 0.25 + speed * 0.9) / n * 2, 74, 0.075);
      }
    } else {
      stir(p.x, p.y, 0.8, 74, 0.2);
    }
    pointer = { ...p, t: now };
  }
  const onLeave = () => { pointer = null; };
  const onDown = (e) => {
    if (!ctx) return;
    const p = local(e);
    stir(p.x, p.y, 3.2, 96, 0.7);
  };
  /** Clarity at a link's stone, 0…1 — how much of it can be seen. */
  const seenAt = (i) => {
    if (!clear) return 1;
    const s = stones[i];
    const n = Math.round(s.y / GRID + 1) * cols + Math.round(s.x / GRID + 1);
    return BASE_SEEN + (clear[n] || 0);
  };
  // Touch: a first tap on a stone still hidden under the water stirs and
  // reveals it; the next tap opens it. A mouse has already revealed what it
  // points at, and the keyboard never needs to see.
  const onLinkClick = (e) => {
    const a = e.currentTarget;
    const i = Number(a.dataset.i);
    // judged by what could be seen before this tap stirred the water
    if (ctx && a.dataset.ptr === 'touch' && Number(a.dataset.seen) < 0.4) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const s = stones[i];
      stir(s.x, s.y, 3, s.w * 0.75, 0.95);
    }
  };
  const onLinkDown = (e) => {
    const a = e.currentTarget;
    a.dataset.ptr = e.pointerType;
    a.dataset.seen = String(seenAt(Number(a.dataset.i)));
  };
  const onFocus = (e) => {
    const s = stones[Number(e.currentTarget.dataset.i)];
    if (s) stir(s.x, s.y, 2.2, s.w * 0.7, 0.9);
  };

  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('pointerdown', onDown);
  links.forEach((a) => {
    a.addEventListener('click', onLinkClick, true);
    a.addEventListener('pointerdown', onLinkDown);
    a.addEventListener('focus', onFocus);
  });

  const ro = new ResizeObserver(() => {
    const r = host.getBoundingClientRect();
    if (Math.round(r.width) !== W || Math.round(r.height) !== H) { size(); start(); }
  });
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((en) => { visible = en.some((x) => x.isIntersecting) && !document.hidden; if (visible) start(); })
    : null;
  const onVis = () => { visible = !document.hidden; if (visible) start(); };

  size();
  ro.observe(host);
  io?.observe(host);
  document.addEventListener('visibilitychange', onVis);
  // the pond opens with one ring, so it reads as water at once
  if (ctx) { stir(W * 0.5, H * 0.45, 4, 0, 0); start(); }

  return {
    get webgl() { return Boolean(ctx); },
    seenAt,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
      const lose = ctx?.gl.getExtension('WEBGL_lose_context');
      lose?.loseContext();
    },
  };
}
