// Critter Stitcher service worker: caches the single page + icons so the game installs and runs offline.
// Pages are served NETWORK-FIRST (no HTTP cache, ~3 s timeout) so a new deploy shows up on the very next launch;
// the cached copy is only used offline or on a very slow network. Music (music/) and sound effects (sfx/) are cached the first time they load, so they work offline after that.
const VERSION = '1.2.2', BUILD = '95cb9002be';
const CACHE = 'critter-stitcher-' + BUILD;
const NAV_TIMEOUT = 3000;
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  // cache:'reload' skips the browser HTTP cache (GitHub Pages sends max-age=600), so a new worker never precaches an old page
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache:'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('critter-stitcher-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function navigate(){
  const cache = await caches.open(CACHE);
  const net = fetch('./index.html', { cache:'no-store' }).then(async r => { if (r.ok) await cache.put('./index.html', r.clone()); return r; });
  const slow = new Promise(res => setTimeout(res, NAV_TIMEOUT, null));
  try {
    const r = await Promise.race([net, slow]);
    if (r && r.ok) return r;
    const hit = await cache.match('./index.html');
    if (hit) return hit;            // timed out or server error: use the copy we have
    return r || await net;          // nothing cached yet: wait for the network
  } catch (err) {                   // offline
    const hit = await cache.match('./index.html');
    if (hit) return hit;
    throw err;
  }
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;   // update check: always straight to the network
  if (req.mode === 'navigate') { e.respondWith(navigate()); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.status === 200 && (url.pathname.includes('/music/') || url.pathname.includes('/sfx/'))) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return r;
  })));
});
