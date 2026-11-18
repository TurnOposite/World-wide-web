/**
 * /antenna — the streams, and the telegraph line (Ortis, 2026-11-10).
 *
 * The window that was Zone's Atlas until that day (« its weird having two
 * anyways, and we need space for the streams and telegraph lines… call that
 * window Antenna »). Two things live here:
 *
 *   - the streams: Everything, and beside it Chill and Energy — each its own
 *     clock over its own part of the library (server/lib/channels.js), all
 *     on air at once. The dial that stood on /radio moved here; /radio says
 *     which stream is playing and leads back.
 *   - the telegraph line: the one chat room, for whoever is tuned in,
 *     whatever their stream (ui/telegraph.js).
 *
 * Where the tower broadcasts from — the point on the map this window used to
 * show — is set aside for now (« forget about emitting from somewhere »);
 * the rule that finds it is still pages/zone.js, which Echo's Atlas uses.
 * /zone, the window's old address, still opens it.
 */
import { ChannelDial } from '../ui/channels.js';
import { TelegraphLine } from '../ui/telegraph.js';
import { PHONE_MEDIA } from '../world/layout.js';

/** The line's list is never shorter than this: about three messages. */
const LOG_MIN = 150;

export const title = 'Antenna';

export function mount(root, ctx) {
  const { client, toast } = ctx;
  root.innerHTML = `
    <div class="page-head antenna-head"><h1>Antenna</h1></div>
    <div class="antenna">
      <section class="antenna-streams" aria-label="Streams">
        <div class="channels antenna-dial" id="anDial" hidden></div>
        <p class="hint antenna-one" id="anOne" hidden>One stream is on air for now: Everything.</p>
        <div class="lane-slots" id="anSlots" role="group" aria-label="Who is listening" hidden></div>
      </section>
      <section class="panel antenna-line" id="anLine"></section>
    </div>`;
  const one = root.querySelector('#anOne');
  // The listeners as join slots (MB-02): one lit per person tuned in, the rest waiting for whoever presses play.
  const slots = root.querySelector('#anSlots');
  const SLOTS = 4;
  const paintSlots = () => {
    const n = ctx.player?.data?.listeners;
    slots.hidden = client.mode === 'cloud' || !Number.isFinite(n);
    if (slots.hidden) return;
    const lit = Math.min(n, SLOTS);
    slots.innerHTML = Array.from({ length: SLOTS }, (_, i) => (i < lit
      ? `<span class="slot lit"><svg viewBox="0 0 20 24" aria-hidden="true"><circle cx="10" cy="7" r="5"/><path d="M2 23 Q10 11 18 23Z"/></svg><b>P${i + 1}</b>${i === SLOTS - 1 && n > SLOTS ? `<i>+${n - SLOTS}</i>` : ''}</span>`
      : `<button type="button" class="slot" data-join>Press ▶ to join</button>`)).join('');
    slots.setAttribute('aria-label', `${n} listening`);
  };
  slots.addEventListener('click', (e) => {
    if (!e.target.closest('[data-join]')) return;
    const audio = document.getElementById('audio');
    if (audio?.paused) document.getElementById('mbTune')?.click();
  });
  const onStation = () => paintSlots();
  ctx.player?.addEventListener?.('station', onStation);
  paintSlots();
  const dial = new ChannelDial({ root: root.querySelector('#anDial'), client, label: 'Streams', noun: 'streams', onPaint: (n) => { one.hidden = n >= 2; } });
  const lineEl = root.querySelector('#anLine');
  const line = new TelegraphLine({ root: lineEl, client, toast });

  // In the world, on a desktop, the window shows this page whole (world.js fitPage) and only the line's list
  // scrolls: the list takes exactly the height the window has left under everything else, measured rather than
  // guessed (site.css gives the first guess, and the phone's and the classic shell's size).
  const box = root.closest('.w-box');
  const log = lineEl.querySelector('.tg-log');
  const grid = root.querySelector('.antenna');
  const phone = matchMedia(PHONE_MEDIA);
  let queued = 0;
  const size = () => {
    queued = 0;
    if (!box || !log.isConnected) return;
    if (phone.matches || getComputedStyle(log).display === 'none') { log.style.height = ''; return; }
    const b = box.getBoundingClientRect();
    const k = b.height / (box.offsetHeight || 1) || 1; // screen pixels per page pixel: the window is zoomed
    const used = (lineEl.getBoundingClientRect().bottom - b.top) / k - log.offsetHeight;
    // The room is the window's at full size: when fitPage has drawn the page smaller (box.dataset.fit < 1) the
    // window counts more page pixels, and a list that grew into them would be shrunk again, and again.
    const room = box.clientHeight * (Number(box.dataset.fit) || 1);
    // Under the line: the page's own foot (what it keeps below its last block) and the window's padding.
    const tail = (root.getBoundingClientRect().bottom - grid.getBoundingClientRect().bottom) / k + (parseFloat(getComputedStyle(box).paddingBottom) || 0);
    const h = Math.max(LOG_MIN, Math.floor(room - tail - used - 8));
    if (Math.abs(h - log.offsetHeight) > 1) log.style.height = `${h}px`;
  };
  const resize = () => { if (!queued) queued = requestAnimationFrame(size); };
  const watch = box && globalThis.ResizeObserver ? new ResizeObserver(resize) : null;
  watch?.observe(box);
  watch?.observe(lineEl.querySelector('.tg-foot'));
  phone.addEventListener?.('change', resize);
  resize();

  return () => { ctx.player?.removeEventListener?.('station', onStation); dial.destroy(); line.destroy(); watch?.disconnect(); phone.removeEventListener?.('change', resize); cancelAnimationFrame(queued); };
}
