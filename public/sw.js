const CACHE_NAME = "ddr-dashboard-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/css/dashboard.css",
  "/js/app.js",
  "/js/api.js",
  "/js/router.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

function isCacheableStaticRequest(request) {
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return false;
  }
  const path = new URL(request.url).pathname;
  return (
    path === "/" ||
    path === "/manifest.webmanifest" ||
    path === "/favicon.ico" ||
    path === "/icon-192.svg" ||
    path === "/icon-512.svg" ||
    path.startsWith("/css/") ||
    path.startsWith("/js/")
  );
}

self.addEventListener("fetch", (event) => {
  if (!isCacheableStaticRequest(event.request)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    }),
  );
});
