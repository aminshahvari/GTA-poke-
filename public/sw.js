// Service worker: shows tournament notifications and opens the club when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try{ d = e.data ? e.data.json() : {}; }catch(err){ d = { title: 'Blindrise', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Blindrise', { body: d.body || '', tag: d.tag, renotify: true, icon: '/icon-180.png', badge: '/icon-180.png', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
