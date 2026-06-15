// Service worker for DFSQ Practice (PWA).
//
// Strategy: cache-first for everything in the precache list (the app
// shell + content). On every install, a fresh cache is built keyed by
// the version string below. The build-web.js script bumps CACHE_VERSION
// to the current build timestamp so updates roll out automatically when
// the user opens the deployed page after a new GitHub Pages deploy.
//
// At runtime:
//   - GET requests hit the cache first and only fall back to the network
//     if there's no cached match. That makes the app work offline.
//   - Network responses for same-origin GET requests are stored in the
//     cache for next time.
//   - On activation, old caches are deleted so the user's storage
//     doesn't grow unbounded.

const CACHE_VERSION = '2026-06-15T09-37-34-956Z';   // replaced by build-web.js
const CACHE_NAME = 'dfsq-' + CACHE_VERSION;

// Files we want available offline as soon as the SW installs.
// These paths are relative to the service worker's scope, so they work
// regardless of whether the site is at the root or under a sub-path
// like /DigitalFSTest/.
const PRECACHE = [
  './',
  'index.html',
  'app.js',
  'web-bridge.js',
  'manifest.json',
  'favicon.png',
  'icon-192.png',
  'icon-512.png',
  'styles/main.css',
  'screens/components.js',
  'screens/home.js',
  'screens/history.js',
  'screens/section-a.js',
  'screens/section-b.js',
  'screens/results.js',
  'screens/work-on.js',
  'screens/accessibility.js',
  'screens/screenshot-tool.js',
  'screens/update-banner.js',
  'screens/install-prompt.js',
  'editors/spreadsheet.js',
  'editors/docx-editor.js',
  'editors/email-editor.js',
  'editors/form.js',
  'assets/banks/e3.json',
  'assets/banks/l1.json',
  'assets/scenarios/e3.json',
  'assets/scenarios/l1.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // If one of the files 404s the install still finishes — better to
        // be a partial cache than no cache at all.
        console.warn('[sw] precache addAll failed (partial cache):', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('dfsq-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Don't intercept cross-origin requests (e.g. html2canvas from cdnjs).
  // Let the browser handle them normally — the SW interferes with the
  // CORS dance and breaks them when offline anyway.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Refresh in the background so the cache stays fresh while the
        // user gets an instant response.
        fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, res));
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        // Cache successful same-origin responses for next time.
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Offline AND nothing cached for this URL — return a basic
        // offline page for navigations so the user sees something.
        if (req.mode === 'navigate') {
          return caches.match('index.html');
        }
        return new Response('Offline and no cache for ' + url.pathname,
          { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// Optional: allow the page to ping the SW to check status.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
