/**
 * /booth — the DJ booth. Changes what is playing, never what the station is.
 *
 * Three levers, all bounded by the station's own rules:
 *   1. rearrange what's next (the queue editor — a permutation, beyond the fence);
 *   2. a Spontaneous Emission — "play this mood now" — which is the same
 *      permutation, chosen by dj/moods.json instead of by hand;
 *   3. the broadcast look — the visuals every listener sees unless they chose
 *      their own.
 *
 * Where the change is saved depends on the station: the GitHub repo (static
 * site), this browser only (a preview), or a Radio Tower server (station key).
 */
import { esc } from '../ui/util.js';
import { QueueEditor } from '../ui/queue.js';
import { resolveMood, planEmission } from '../ui/moods.js';
import { LOOKS } from '../viz/settings.js';

export const title = 'DJ booth';

export async function mount(root, ctx) {
  const { client, player, settings, toast } = ctx;
  const gh = client.config.github || {};
  const planeText = () => ({
    artifact: client.canWrite
      ? 'Shared preview: changes are saved with this preview on claude.ai, and everyone it is shared with hears them within seconds.'
      : 'Shared preview, <b>view-only for you</b>: the person who shared it can change the queue.',
    github: `Changes are committed to <b>${esc(gh.owner)}/${esc(gh.repo)}</b> (<code>${esc(gh.controlPath || 'site/station/control.json')}</code>). Every listener picks them up within a minute or two.`,
    local: 'Preview mode: changes are kept <b>in this browser only</b> — open two tabs to see two listeners agree. Nobody else hears them.',
    static: 'This copy of the site has no repository configured, so the booth is read-only. Try it in preview mode, or publish the site from GitHub.',
    tower: `Connected to a Radio Tower server at <b>${esc(client.origin || '')}</b>. Changes need its station key.`,
  }[client.planeKind] || '');

  root.innerHTML = `
    <div class="page-head"><h1>DJ booth</h1>
      <p>Rearrange what's next, fire a mood, set the lights. What's on air and the next few minutes never move: every listener stays on the same second.</p></div>
    <div class="booth">
      <div>
        <div class="panel" id="bQueue"></div>
        <div class="panel" style="margin-top:18px">
          <div class="panel-head"><h2>Spontaneous Emissions</h2></div>
          <p class="queue-note">Pick a mood, or type one. The movable part of the queue is reordered so the best matches come first — nothing is added or removed.</p>
          <div class="moods" id="bMoods"></div>
          <form class="field" id="bFree" autocomplete="off"><label for="bFreeIn">Your own words</label>
            <div style="display:flex;gap:8px"><input id="bFreeIn" placeholder="e.g. night drive, zelda, rainy" style="flex:1"><button class="btn" type="submit">Emit</button></div></form>
          <p class="qstate" id="bMoodState" aria-live="polite"></p>
        </div>
      </div>
      <div>
        <div class="panel">
          <h2>Where changes go</h2>
          <div class="plane" id="bPlane"><span>${planeText()}</span></div>
          <div id="bAuth"></div>
        </div>
        <div class="panel" style="margin-top:18px">
          <h2>Broadcast look</h2>
          <p class="queue-note">The visuals everyone sees — unless a listener picked their own in the Visuals panel.</p>
          <div class="v-looks" id="bLooks"></div>
          <div class="v-row"><button class="btn small" type="button" id="bSendMine">Send my current visuals</button><button class="btn small" type="button" id="bClearLook">No broadcast look</button></div>
          <p class="qstate" id="bLookState" aria-live="polite"></p>
        </div>
      </div>
    </div>`;
  const $ = (id) => root.querySelector(`#${id}`);

  // ---- where changes go / auth
  const paintAuth = () => {
    const a = $('bAuth');
    if (client.planeKind === 'github') {
      const has = client.canWrite;
      a.innerHTML = has
        ? `<p class="qstate ok">A token is saved in this browser.</p><button class="btn small" type="button" id="bForget">Forget the token</button>`
        : `<form class="field" id="bTokForm"><label for="bTok">GitHub fine-grained token — only this repository, <i>Contents: Read and write</i></label>
             <input id="bTok" type="password" spellcheck="false" autocomplete="off" placeholder="github_pat_…">
             <button class="btn small primary" type="submit">Save in this browser</button></form>
           <p class="hint">Create one at github.com → Settings → Developer settings → Fine-grained tokens. It never leaves this browser except to talk to api.github.com. <a href="?control=local" data-external>Or try the booth in preview mode.</a></p>`;
      a.querySelector('#bForget')?.addEventListener('click', () => { client.setToken(null); paintAuth(); queue.refresh({ force: true }); });
      a.querySelector('#bTokForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = a.querySelector('#bTok').value.trim();
        if (!v) return;
        client.setToken(v);
        a.querySelector('#bTok').value = '';
        paintAuth();
        queue.refresh({ force: true });
        toast('Token saved in this browser.');
      });
    } else if (client.planeKind === 'tower') {
      a.innerHTML = client.canWrite
        ? '<p class="qstate ok">Unlocked for this visit.</p><button class="btn small" type="button" id="bLock">Lock</button>'
        : `<form class="field" id="bKeyForm"><label for="bKey">Station key</label><input id="bKey" type="password" autocomplete="off" spellcheck="false"><button class="btn small primary" type="submit">Unlock</button></form>`;
      a.querySelector('#bLock')?.addEventListener('click', () => { client.setToken(null); paintAuth(); queue.refresh({ force: true }); });
      a.querySelector('#bKeyForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = a.querySelector('#bKey').value.trim();
        a.querySelector('#bKey').value = '';
        if (v) { client.setToken(v); paintAuth(); queue.refresh({ force: true }); }
      });
    } else if (client.planeKind === 'static') {
      a.innerHTML = '<p class="hint"><a class="btn small" href="?control=local" data-external>Open the booth in preview mode</a></p>';
    } else a.innerHTML = '';
  };

  const queue = new QueueEditor({ root: $('bQueue'), client, player, title: 'Queue' });
  paintAuth();

  // ---- moods
  let vocab = null;
  try { vocab = await (await fetch(new URL('station/moods.json', document.baseURI))).json(); } catch { vocab = null; }
  const moodState = (t, tone = '') => { const s = $('bMoodState'); s.textContent = t; s.className = `qstate ${tone}`; };
  const emit = async (input) => {
    if (!client.canWrite) { moodState(client.planeKind === 'github' ? 'Save a token first.' : 'The booth is locked.', 'bad'); return; }
    try {
      const mood = resolveMood(input, vocab);
      const q = await client.get('/api/queue');
      const plan = planEmission(q.slots || [], mood);
      if (!plan.ok) { moodState(plan.detail, 'bad'); return; }
      if (!plan.matched) { moodState(`Nothing in the movable part of the queue matches “${mood.name}”. Try another mood in a few minutes.`, 'bad'); return; }
      if (!plan.changed) { moodState(`The queue already leads with “${mood.name}”.`, 'ok'); return; }
      const ok = await queue.apply({ cycleIndex: plan.cycleIndex, startWithin: plan.startWithin, ids: plan.ids }, { by: 'emission', note: `mood: ${mood.name}` });
      if (!ok) { moodState(`Not emitted: ${queue.msg.text}`, 'bad'); return; }
      moodState(`Emitted “${mood.name}” — ${plan.matched} matching track${plan.matched === 1 ? '' : 's'} brought forward.`, 'ok');
    } catch (err) {
      moodState(err.message, 'bad');
    }
  };
  if (vocab) {
    $('bMoods').innerHTML = Object.entries(vocab.moods).map(([name, m]) =>
      `<button type="button" data-mood="${esc(name)}" title="${esc(m.why || '')}">${esc(name)}</button>`).join('');
    $('bMoods').addEventListener('click', (e) => { const b = e.target.closest('[data-mood]'); if (b) emit(b.dataset.mood); });
    $('bFree').addEventListener('submit', (e) => { e.preventDefault(); const v = $('bFreeIn').value.trim(); if (v) emit(v); });
  } else {
    $('bMoods').innerHTML = '<p class="empty">moods.json did not load</p>';
  }

  // ---- broadcast look
  const lookState = (t, tone = '') => { const s = $('bLookState'); s.textContent = t; s.className = `qstate ${tone}`; };
  const paintLooks = () => {
    const cur = client.look?.look;
    $('bLooks').innerHTML = Object.entries(LOOKS).map(([k, l]) => `<button type="button" data-look="${k}" aria-pressed="${cur === k}">${l.label}</button>`).join('');
  };
  const sendLook = async (look) => {
    if (!client.canWrite) { lookState(client.planeKind === 'github' ? 'Save a token first.' : 'The booth is locked.', 'bad'); return; }
    lookState('saving…');
    try {
      await client.setLook(look);
      lookState(look ? `Broadcasting “${LOOKS[look.look]?.label || 'custom'}”.` : 'No broadcast look — listeners see their own.', 'ok');
      paintLooks();
    } catch (err) { lookState(err.message, 'bad'); }
  };
  paintLooks();
  $('bLooks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-look]');
    if (!b) return;
    const L = LOOKS[b.dataset.look];
    sendLook({ look: b.dataset.look, layers: Object.fromEntries(Object.keys(settings.effective.layers).map((id) => [id, L.layers.includes(id)])), intensity: L.intensity });
  });
  $('bSendMine').addEventListener('click', () => sendLook({ ...settings.effective }));
  $('bClearLook').addEventListener('click', () => sendLook(null));
  // The preview's shared database can arrive after the booth has drawn.
  let shownPlane = `${client.planeKind}:${client.canWrite}`;
  const repaintPlane = () => {
    const now = `${client.planeKind}:${client.canWrite}`;
    if (now === shownPlane) return;
    shownPlane = now;
    $('bPlane').innerHTML = `<span>${planeText()}</span>`;
    paintAuth();
  };
  const off = client.on?.('control', () => { paintLooks(); repaintPlane(); });
  const offPlane = client.plane?.onChange?.(repaintPlane);

  return () => { queue.destroy(); off?.(); offPlane?.(); };
}
