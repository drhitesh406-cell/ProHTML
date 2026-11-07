'use strict';
// Cache names only change the app shell. IndexedDB and localStorage are untouched.
const V = 'html-reader-mcq-bookmarks-v30';
const SHELL = [
  './', 'index.html', 'custom-module.html', 'manifest.webmanifest',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
  'assets/liquid-glass.css', 'assets/liquid-glass.js',
  'assets/mcq-search.css', 'assets/mcq-search.js', 'assets/bookmarks.js', 'assets/mcq-question-index.json', 'assets/mcq-qbank-hub-pyq-index.json',
  'assets/fonts/inter-latin-400-normal.woff2', 'assets/fonts/inter-latin-700-normal.woff2'
];
self.addEventListener('install', event => {
  // Cache each file separately so one missing file can never break the whole install.
  event.waitUntil(caches.open(V).then(cache => Promise.all(SHELL.map(u => cache.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('html-reader-') && key !== V).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        const copy = response.clone();
        event.waitUntil(caches.open(V).then(cache => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    } catch (_) {
      const cached = await caches.match(request, {ignoreSearch: true});
      if (cached) return cached;
      // Never send HTML in place of a missing CSS, JS, JSON, or image asset.
      if (request.mode === 'navigate') {
        const home = await caches.match(new URL('index.html', self.registration.scope).href);
        if (home) return home;
      }
      return new Response('Unavailable offline', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    }
  })());
});
