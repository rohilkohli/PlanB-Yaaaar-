/* Loaded by the Workbox service worker (importScripts). Shows reminder notifications and opens the app when tapped. */
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
  const url = typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/today';
  event.waitUntil(self.registration.showNotification(String(d.title || 'PlanB').slice(0, 80), {
    body: String(d.body || '').slice(0, 160),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: typeof d.tag === 'string' ? d.tag : 'planb',
    data: { url }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/today';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* cross-origin guard */ } } return; }
    }
    await self.clients.openWindow(url);
  })());
});
