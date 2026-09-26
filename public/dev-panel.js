/**
 * The visualiser's dev panel — tuning knobs, live.
 *
 * Never imported except when `?viz=dev` is in the URL (see the dynamic
 * `import()` in `app.js`), so a normal listener's browser never fetches or
 * parses this file — that is the whole meaning of "no bundle cost in
 * production" on a project with no bundler: the module simply is never
 * requested.
 *
 * It does exactly one thing: render a slider per `Visualizer#knobs` field,
 * write straight into that object on `input`, and read it back to build a
 * paste-ready snippet. The render loop already reads `knobs` fresh every
 * frame (see `defaultKnobs()`'s doc comment in `viz.js`), so there is no
 * wiring beyond "mutate the shared object" — no events, no rebuild.
 */

/** One row per knob: [key, label, min, max, step]. `null` step means integer. */
const ROWS = [
  ['gainLow', 'Low gain', 0, 3, 0.05],
  ['gainMid', 'Mid gain', 0, 3, 0.05],
  ['gainHigh', 'High gain', 0, 3, 0.05],
  ['smoothAttack', 'Attack rate', 1, 60, 1],
  ['smoothRelease', 'Release rate', 0.5, 30, 0.5],
  ['onsetSensitivity', 'Onset sensitivity', 1, 4, 0.05],
  ['driftSpeed', 'Hue drift speed', 0, 3, 0.05],
  ['driftAmp', 'Hue drift amount', 0, 3, 0.05],
  ['hueEase', 'Hue ease rate', 0.1, 6, 0.1],
  ['bloomOpacity', 'Bloom opacity', 0, 3, 0.05],
  ['ringOpacity', 'Ring opacity', 0, 3, 0.05],
  ['dispersalOpacity', 'Dispersal opacity', 0, 3, 0.05],
  ['shockOpacity', 'Shock opacity', 0, 3, 0.05],
  ['sparkOpacity', 'Spark opacity', 0, 3, 0.05],
  ['ribbonOpacity', 'Ribbon opacity', 0, 3, 0.05],
  ['stageOpacity', 'Stage opacity', 0, 1, 0.01],
  ['stageScale', 'Stage scale', 0.3, 2.5, 0.05],
];

const STYLE = `
#vizDevPanel{
  position:fixed;right:12px;bottom:12px;z-index:1000;width:280px;max-height:80vh;
  overflow-y:auto;background:rgba(10,12,15,.94);border:1px solid #2a323c;
  border-radius:10px;padding:12px 14px;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;
  color:#cfd7e0;backdrop-filter:blur(6px);
}
#vizDevPanel h4{margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8b96a3}
#vizDevPanel .row{display:flex;align-items:center;gap:6px;margin:5px 0}
#vizDevPanel .row label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#vizDevPanel .row input[type=range]{width:110px}
#vizDevPanel .row .val{width:44px;text-align:right;flex:none;color:#ffb340}
#vizDevPanel select{width:100%;margin:4px 0 10px;background:#12161b;color:#cfd7e0;border:1px solid #2a323c;border-radius:6px;padding:4px}
#vizDevPanel button{width:100%;margin-top:8px;background:#1a2029;border:1px solid #2a323c;color:#cfd7e0;border-radius:6px;padding:6px;cursor:pointer;font:inherit}
#vizDevPanel button:hover{border-color:#ffb340}
#vizDevPanel textarea{width:100%;height:150px;margin-top:8px;background:#0e1216;color:#8fe3a3;border:1px solid #2a323c;border-radius:6px;font:inherit;padding:6px;resize:vertical}
#vizDevPanel .tier-row{display:flex;gap:4px;margin:6px 0 10px}
#vizDevPanel .tier-row button{flex:1;margin:0;padding:5px}
#vizDevPanel .tier-row button.active{border-color:#ffb340;color:#ffb340}
`;

/**
 * @param {() => import('./viz.js').Visualizer} getViz  a getter so the panel
 *   keeps working across a hot-reloaded Visualizer instance (public/app.js
 *   swaps the module-level `viz` binding; the knobs object itself survives
 *   the swap unchanged, so this indirection is only needed for the handful
 *   of reads that aren't the knobs object — tier display, preset name).
 */
export function mountDevPanel(getViz) {
  if (document.getElementById('vizDevPanel')) return;   // idempotent

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'vizDevPanel';
  panel.innerHTML = `<h4>viz dev panel</h4>`;
  document.body.appendChild(panel);

  const knobs = getViz().knobs;

  for (const [key, label, min, max, step] of ROWS) {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('label');
    lab.textContent = label;
    lab.htmlFor = `vk-${key}`;
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `vk-${key}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(knobs[key]);
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = Number(knobs[key]).toFixed(2);
    input.addEventListener('input', () => {
      knobs[key] = Number(input.value);
      val.textContent = knobs[key].toFixed(2);
    });
    row.append(lab, input, val);
    panel.appendChild(row);
  }

  // Tier override: -1 means "auto" (null in the knob). Two independent rows —
  // the frame canvas and the stage each have their own tier (the stage's
  // auto tier is always at least one below the frame's, see stageTierFor in
  // viz.js), so tuning one by hand must not disturb the other.
  const tierRow = buildTierRow('tierOverride', knobs);
  panel.appendChild(tierRow);

  const stageTierLabel = document.createElement('label');
  stageTierLabel.textContent = 'Stage tier override';
  stageTierLabel.style.cssText = 'display:block;margin-top:6px;color:#8b96a3';
  panel.appendChild(stageTierLabel);
  const stageTierRow = buildTierRow('stageTierOverride', knobs);
  panel.appendChild(stageTierRow);

  const btnCopy = document.createElement('button');
  btnCopy.textContent = 'Copy defaults snippet';
  const out = document.createElement('textarea');
  out.readOnly = true;
  out.hidden = true;

  btnCopy.addEventListener('click', async () => {
    const snippet = knobsToSnippet(knobs);
    out.value = snippet;
    out.hidden = false;
    try {
      await navigator.clipboard.writeText(snippet);
      btnCopy.textContent = 'Copied ✓ (also below)';
    } catch {
      btnCopy.textContent = 'Copy failed — select below';
    }
    setTimeout(() => { btnCopy.textContent = 'Copy defaults snippet'; }, 2000);
  });

  panel.append(btnCopy, out);
}

/**
 * A row of "Auto / T0 / T1 / T2" buttons writing an integer-or-null tier
 * override straight into `knobs[key]`. Used for both `tierOverride` (the
 * small canvas) and `stageTierOverride` (the full-page stage) — same
 * behaviour, different key, so this is the one place that logic lives.
 */
function buildTierRow(key, knobs) {
  const row = document.createElement('div');
  row.className = 'tier-row';
  const labels = ['Auto', 'T0', 'T1', 'T2'];
  const buttons = labels.map((label, i) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      knobs[key] = i === 0 ? null : i - 1;
      for (const b of buttons) b.classList.remove('active');
      btn.classList.add('active');
    });
    row.appendChild(btn);
    return btn;
  });
  buttons[0].classList.add('active');
  return row;
}

/** Render the live knob values as a paste-ready replacement for defaultKnobs()'s body. */
function knobsToSnippet(knobs) {
  const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n.toFixed(4)));
  const lines = Object.entries(knobs)
    .filter(([k]) => k !== 'tierOverride' && k !== 'stageTierOverride')
    .map(([k, v]) => `    ${k}: ${fmt(v)},`);
  return `// Pasted from the dev panel (?viz=dev) — paste over defaultKnobs()'s body.\nreturn {\n${lines.join('\n')}\n    tierOverride: null,\n    stageTierOverride: null,\n  };`;
}

export default mountDevPanel;
