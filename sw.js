// sw.js — lets Workeriser open and keep working without a signal.
//
// This must be uploaded to the SAME folder as the main Workeriser HTML file on
// GitHub Pages (e.g. simonparkin.github.io/Workeriser/sw.js), and the HTML file
// must register it (already done in this version of workeriser.html).
//
// What it does:
//  - Caches the app's own page/manifest/icons as they're loaded, and serves the
//    last cached copy if a later load has no connection.
//  - Caches the Firebase SDK's JS files the same way, so the app can even start
//    up (import its dependencies) with zero signal.
//  - Leaves everything else — importantly, Firestore's own network requests —
//    completely alone. The Firestore SDK handles its own offline queueing and
//    caching internally; this service worker only deals with the app shell.

const CACHE_NAME = 'workeriser-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isOwnOrigin = url.origin === self.location.origin;
  const isFirebaseSdk = url.hostname === 'www.gstatic.com';

  // leave everything else alone — Firestore's own API traffic included
  if (!isOwnOrigin && !isFirebaseSdk) return;

  if (isFirebaseSdk) {
    // these SDK files are versioned in the URL itself (e.g. /firebasejs/10.12.2/...)
    // so once cached they never need to be re-fetched — cache-first is safe and fast
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return res;
      }))
    );
    return;
  }

  // the app's own page, manifest, and icons: try the network first so updates are
  // picked up whenever there's a connection, falling back to the last cached copy
  // if there's no signal at all
  event.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      return res;
    }).catch(() => caches.match(req))
  );
});
