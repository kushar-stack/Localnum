const CACHE_NAME = "busy-brief-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/logic.js",
  "/utils.js",
  "/constants.js",
  "/db.js",
  "https://fonts.googleapis.com/css2?family=Newsreader:wght@400;600&family=Sora:wght@400;600;700&display=swap"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
