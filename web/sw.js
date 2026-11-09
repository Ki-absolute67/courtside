// Courtside service worker: app shell works offline, ESPN data falls back to the last copy seen.
const VERSION = "courtside-v2";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Live stats: try the network first, use the saved copy when offline.
  if (url.hostname.endsWith("api.espn.com")) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
    return;
  }

  // App files, fonts, logos and headshots: serve from cache, refresh in the background.
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com|espncdn\.com/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req)
          .then(res => {
            if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
            return res;
          })
          .catch(() => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()));
        return hit || net;
      })
    );
  }
});
