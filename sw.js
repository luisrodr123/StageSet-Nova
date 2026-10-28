const CACHE_NAME = "stageset-shell-v14";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./timecode.js",
  "./ltc-worklet.js",
  "./sync.js",
  "./network-midi.js",
  "./mosaic.html",
  "./mosaic.js",
  "./midi.js",
  "./cdg.js",
  "./documents.js",
  "./zip-import.js",
  "./backup.js",
  "./pitch-worklet.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("stageset-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(event.request)
        ?? (event.request.mode === "navigate" ? cache.match("./index.html") : undefined)
        ?? Response.error();
    }
  })());
});
