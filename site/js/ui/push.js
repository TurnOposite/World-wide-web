/**
 * « Tell me when someone writes » — the listener's side of the line's
 * notifications (Ortis, 2026-11-16: « phone notification for messages in
 * antenna »). The tower's side is server/lib/notify.js.
 *
 * Standard Web Push, and only when asked: the button is the only thing that
 * registers the service worker (sw.js), asks the browser's permission and
 * hands the tower a subscription. « Stop » takes it back from both. Nothing
 * is kept about the listener but that subscription — an address at the
 * browser's own push service and two keys — and no name goes with it.
 *
 * iPhone: Safari only offers Web Push to a site added to the Home Screen and
 * opened from there (iOS 16.4 or later); a Safari tab has no PushManager at
 * all. `support()` tells the three cases apart so the line can say so in one
 * sentence instead of showing a button that cannot work.
 *
 * The top of this file is pure (no DOM) so node:test can check it.
 */

/**
 * Can this browser be told? 'ok' — yes, ask; 'ios-home' — an iPhone or iPad in a Safari tab: add the site to the
 * Home Screen first; 'none' — no.
 */
export function support(env = globalThis) {
  const nav = env.navigator;
  if (!nav) return 'none';
  if (nav.serviceWorker && 'PushManager' in env && 'Notification' in env) return 'ok';
  const ua = String(nav.userAgent || '');
  // iPadOS says it is a Mac; a Mac has no touch points.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true || Boolean(env.matchMedia?.('(display-mode: standalone)').matches);
  return ios && !standalone ? 'ios-home' : 'none';
}

/** The tower's public key as the bytes pushManager.subscribe wants (it arrives base64url). */
export function keyBytes(b64u) {
  const s = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** A PushSubscription as the tower keeps it: the endpoint and the two keys, nothing else. */
export function plainSubscription(sub) {
  const j = typeof sub?.toJSON === 'function' ? sub.toJSON() : sub;
  if (!j?.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } };
}

/** What the line says under each case. */
export const HINTS = Object.freeze({
  'ios-home': 'On an iPhone: tap Share, then « Add to Home Screen », open the radio from that icon, and you can ask to be told when someone writes.',
  denied: 'This browser has notifications blocked for this site. Allow them in its settings to be told.',
});

/* -------------------------------------------------------------- browser -- */
const swUrl = () => new URL('sw.js', document.baseURI);

async function registration({ create = false } = {}) {
  const have = await navigator.serviceWorker.getRegistration(swUrl().href);
  if (have || !create) return have || null;
  await navigator.serviceWorker.register(swUrl().href, { scope: new URL('./', document.baseURI).pathname });
  return navigator.serviceWorker.ready;
}

/** This browser's subscription, if it has one (asks for nothing, registers nothing). */
export async function current() {
  if (support() !== 'ok') return null;
  try { return plainSubscription(await (await registration())?.pushManager.getSubscription()); } catch { return null; }
}

/**
 * Ask to be told. Must be called from a tap (browsers only ask permission then).
 * @returns {Promise<{ok: true, endpoint: string} | {ok: false, reason: 'unsupported'|'denied'|'failed', detail?: string}>}
 */
export async function subscribe(client, vapidKey) {
  if (support() !== 'ok') return { ok: false, reason: 'unsupported' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };
  try {
    const reg = await registration({ create: true });
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
    const plain = plainSubscription(sub);
    if (!plain) return { ok: false, reason: 'failed', detail: 'The browser gave no subscription.' };
    await client.telegraphSubscribe(plain);
    return { ok: true, endpoint: plain.endpoint };
  } catch (err) {
    return { ok: false, reason: 'failed', detail: err?.message || String(err) };
  }
}

/** Stop being told: the tower forgets the subscription, and so does the browser. */
export async function unsubscribe(client) {
  try {
    const sub = await (await registration())?.pushManager.getSubscription();
    const plain = plainSubscription(sub);
    if (plain) await client.telegraphUnsubscribe(plain.endpoint).catch(() => {});
    await sub?.unsubscribe?.();
  } catch { /* nothing left to undo */ }
  return { ok: true };
}
