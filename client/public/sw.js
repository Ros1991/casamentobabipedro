/* Service worker da Galera do Casamento
 * - permite instalar o site como app
 * - recebe notificações (Web Push) e abre o mural ao tocar
 * - cache leve: assets com hash (cache-first) e a casca do app para abrir sem rede
 * Nunca intercepta /api, /uploads ou /socket.io.
 */
const ASSET_CACHE = 'galera-assets-v1';
const SHELL_CACHE = 'galera-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== ASSET_CACHE && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/socket.io')) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstShell(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirstShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put('/index.html', res.clone());
    return res;
  } catch {
    const hit = await cache.match('/index.html');
    return (
      hit ||
      new Response('<h1 style="font-family:sans-serif;padding:2rem">Sem conexão. Tente de novo em instantes.</h1>', {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    );
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Galera do casamento';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Novidades no mural',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/badge.png',
      tag: data.tag || 'mural',
      renotify: true,
      data: { url: data.url || '/mural' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/mural';
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              /* alguns navegadores não permitem navegar; só foca */
            }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
