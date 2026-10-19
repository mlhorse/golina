// Only a generic offline notice is cached. Never queue ballots or cache authenticated API data.
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open("golina-offline-v1").then((c) => c.add("/offline.html")),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
});
