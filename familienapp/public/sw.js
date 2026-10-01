// Service Worker: App-Hülle offline verfügbar machen. Daten kommen immer
// frisch vom Server (bzw. aus dem lokalen Zwischenspeicher der App).
const CACHE = 'nest-v1';
const ASSETS = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/js/app.js', '/js/ui.js', '/js/store.js', '/js/domain.js',
  '/js/views/home.js', '/js/views/shopping.js', '/js/views/calendar.js', '/js/views/tasks.js', '/js/views/pets.js',
  '/js/views/meals.js', '/js/views/money.js', '/js/views/notes.js', '/js/views/settings.js', '/js/views/more.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cal/')) return;
  // Netzwerk zuerst (damit Updates sofort ankommen), sonst Cache
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('/index.html') : Response.error())),
  );
});
