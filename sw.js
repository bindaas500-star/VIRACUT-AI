/* ViraCut AI service worker — offline-first app shell (v10).
 *
 * Strategy:
 * - Navigations (/, index.html): NETWORK FIRST -> cache fallback.
 *   The shell HTML is always fresh when online; the cached copy keeps
 *   the app opening with zero internet.
 * - Versioned assets (?v=N): CACHE FIRST on the full URL. A changed file
 *   always gets a new ?v= in index.html, so a cached copy is never stale.
 *   (Never use ignoreSearch — it defeats the ?v= cache-busters.)
 * - Everything else same-origin: cache first, network fills on miss.
 */
const CACHE = 'viracut-v10';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/app.css?v=6',
  './js/store.js?v=5',
  './js/plans.js?v=5',
  './js/auth-config.js?v=5',
  './js/auth.js?v=5',
  './js/ai-adapter.js?v=5',
  './js/ai-story.js?v=5',
  './js/trending.js?v=5',
  './js/social.js?v=5',
  './js/audio.js?v=5',
  './js/captions.js?v=5',
  './js/export.js?v=5',
  './js/effects.js?v=6',
  './js/fx-pro.js?v=2',
  './js/photo.js?v=1',
  './js/photo-filters.js?v=1',
  './js/photo-ui.js?v=2',
  './js/editor.js?v=7',
  './js/ai-video.js?v=5',
  './js/projects.js?v=5',
  './js/templates.js?v=5',
  './js/tx-stats.js?v=5',
  './js/tx-data.js?v=5',
  './js/tx-music.js?v=5',
  './js/tx-remote.js?v=5',
  './js/tx-frame.js?v=5',
  './js/tx-flow.js?v=6',
  './js/tx-flow2.js?v=6',
  './js/i18n.js?v=6',
  './js/settings.js?v=5',
  './js/app.js?v=6',
  './templates-catalog.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNav(req) {
  if (req.mode === 'navigate') return true;
  try {
    const u = new URL(req.url);
    return u.pathname === '/' || u.pathname.endsWith('/index.html');
  } catch (e) { return false; }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  // 1. navigations: network first, cache fallback (offline works)
  if (isNav(req)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => {
            c.put('./index.html', copy);
            c.put('./', res.clone()).catch(() => {});
          });
        }
        return res;
      }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 2. everything else: cache first on FULL url (?v= makes it immutable)
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
