const CACHE = 'baby-log-cache-v1';
const FILES = [
  '.',
  'index.html',
  'app.css',
  'app.js',
  'manifest.json'
  // icons if present
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(()=>caches.match('.')))
  );
});