const CACHE_NAME = "busy-brief-v2"; // Incremented version
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/logic.js",
  "/utils.js",
  "/constants.js",
  "/db.js"
];

// Install: Cache essential assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch: NETWORK FIRST strategy for better reliability
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
