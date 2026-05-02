const CACHE_NAME = "busy-brief-v8";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/audio_logic.js",
  "/logic.js",
  "/utils.js",
  "/constants.js",
  "/db.js",
  "/dom.js",
  "/state.js",
  "/api.js",
  "/render.js",
  "/events.js",
  "/app_logic.js",
  "/favicon.ico",
  "/og-image.png",
];

// ============================================================
// INSTALL — cache core assets
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ============================================================
// ACTIVATE — clean old caches
// ============================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ============================================================
// FETCH — network first, cache fallback
// ============================================================
self.addEventListener("fetch", (event) => {
  // Don't intercept API calls — always fresh
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses for static assets
        if (response.ok && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ============================================================
// PUSH NOTIFICATIONS — daily morning brief
// ============================================================
self.addEventListener("push", (event) => {
  let data = { title: "Busy Brief", body: "Your morning brief is ready. Stay sharp." };
  try {
    if (event.data) data = event.data.json();
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title || "Busy Brief", {
      body: data.body || "Your morning brief is ready.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-72.png",
      tag: "daily-brief",
      renotify: false,
      requireInteraction: false,
      data: { url: self.location.origin },
    })
  );
});

// Open app when notification is clicked
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || self.location.origin;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
