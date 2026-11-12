const CACHE_NAME = "sho-po-svitlu-shell-v49";
const APP_SHELL = ["/", "/index.html", "/config.js", "/css/style.css", "/js/app.js", "/js/api.js", "/js/timeline.js", "/js/queue-names.js", "/manifest.json", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/favicon-32.png", "/images/mascot-lightbulb.webp", "/images/mascot-lightbulb-off.webp", "/images/skyline.svg", "/images/skyline-lights.svg", "/images/ukraine-flag-header.gif", "/images/ukraine-flag-header-still.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("sho-po-svitlu-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", response.clone())));
      return response;
    }).catch(async () => (await caches.match("/index.html")) || (await caches.match("/"))));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
      if (response.ok && response.type === "basic") event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
      return response;
    }).catch(async () => (await caches.match(request)) || Response.error()));
});
