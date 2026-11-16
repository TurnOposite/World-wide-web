/**
 * The site's service worker. It exists for one thing: showing « someone wrote
 * on the telegraph line » to a listener who asked to be told (js/ui/push.js;
 * Ortis, 2026-11-16). It is registered only when they ask.
 *
 * It has no `fetch` handler on purpose: it caches nothing and answers no
 * request, so it can never serve an old copy of the site (the trap described
 * in server/index.js, « Cache policy »).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data?.json() || {}; } catch { d = { body: event.data?.text() || '' }; }
  // Always shown: a push that shows nothing loses the permission on some browsers.
  event.waitUntil(self.registration.showNotification(String(d.title || 'Radio Tower').slice(0, 120), {
    body: String(d.body || '').slice(0, 240),
    tag: String(d.tag || 'telegraph'),
    renotify: true,
    icon: 'assets/app-192.png',
    badge: 'assets/app-badge.png',
    data: { url: typeof d.url === 'string' ? d.url : 'antenna' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever a page of this site: the route comes from the tower, but it is resolved inside the worker's own scope.
  const scope = self.registration.scope;
  let target = new URL(String(event.notification.data?.url || 'antenna').replace(/^\/+/, ''), scope);
  if (!target.href.startsWith(scope)) target = new URL('antenna', scope);
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = pages.find((c) => c.url.startsWith(scope));
    if (open) {
      // A page already playing: bring it forward and let its own router go there — reloading it would cut the music.
      open.postMessage({ type: 'go', route: target.href.slice(scope.length) });
      return open.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
