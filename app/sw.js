// Kitchen offline cache: the app shell only. The data is kept by the page itself
// (localStorage), so this never caches the Worker's answer.
// The Pages workflow replaces CACHE with the commit on every publish, so phones pick up
// the new files on the next launch. The value here is only used locally.
const CACHE = 'kitchen-dev';
const FILES = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './logic.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com$/;

self.addEventListener('install', (e) => {
  // HTML is fetched with the cache name as a query so the GitHub Pages CDN cannot hand back the previous version.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => (f.endsWith('.html') || f === './' ? new Request(f + '?' + CACHE, { cache: 'reload' }) : new Request(f, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kitchen-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page sends the Google Fonts URLs it loaded before this worker controlled it
// (the first visit), so the page keeps its typefaces offline from the start.
// The browser does not list font files in resource timing, so the stylesheet is read here
// and the files it names for Latin text are cached too.
const LATIN = /\/\*\s*(latin|latin-ext)\s*\*\/\s*@font-face\s*\{[^}]*?url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/g;
const ANY_FONT = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/g;

async function keep(c, u) {
  const hit = await c.match(u, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(u);
  if (!res.ok) return null;
  await c.put(u, res.clone());
  return res;
}

async function cacheFonts(urls) {
  const c = await caches.open(CACHE);
  const files = new Set();
  for (const u of urls) {
    try {
      const res = await keep(c, u);
      if (!res || !u.startsWith('https://fonts.googleapis.com/')) continue;
      const css = await res.text();
      const latin = [...css.matchAll(LATIN)].map((m) => m[2]);
      for (const f of latin.length ? latin : [...css.matchAll(ANY_FONT)].map((m) => m[1])) files.add(f);
    } catch (e) { /* offline or refused: try again next visit */ }
  }
  await Promise.all([...files].slice(0, 30).map((f) => keep(c, f).catch(() => null)));
}

self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'cache-fonts' || !Array.isArray(d.urls)) return;
  const urls = d.urls.filter((u) => typeof u === 'string' && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)).slice(0, 10);
  e.waitUntil(cacheFonts(urls));
});

// The app's own files and the two Google Fonts, cache first, refreshed in the background.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = url.origin === self.location.origin;
  if (!own && !FONTS.test(url.origin)) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: own, ignoreVary: !own }).then((hit) => {
      const fetching = fetch(e.request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(own && e.request.mode === 'navigate' ? './' : e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fetching;
    })
  );
});
