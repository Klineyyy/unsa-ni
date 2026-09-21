// Makes the app work offline. The AI model itself is cached by transformers.js (in the browser's Cache API);
// this file caches the page, its scripts, the classifier file and the sample photos, so that once someone has used
// the app online one time, it opens and works with no connection.
const CACHE = "unsa-ni-v2";
const CDN = /^https:\/\/cdn\.jsdelivr\.net\//; // where the model runtime (onnxruntime-web) is loaded from

// Everything the page needs that is not found by using it. The sample photos are listed by name because they are
// only requested as thumbnails, before this worker is in charge of the page. A test checks that this list
// contains every file in public/samples.
const PRECACHE = [
  "/",
  "/model/probe.json",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/samples/bicol-express-11261705.jpg",
  "/samples/dinuguan-2923494.jpg",
  "/samples/longganisa-10427563.jpg",
  "/samples/other-333880.jpg",
  "/samples/other-3431746.jpg",
  "/samples/pancit-18156307.jpg",
  "/samples/pinakbet-12256191.jpg",
  "/samples/pinakbet-4405861.jpg",
  "/samples/puto-12608070.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("unsa-ni-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

// Show what we have straight away and refresh it in the background; with no connection, still show it.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  return (await network) ?? (await cache.match("/")) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // files with a hash in their name never change, and the icons and samples rarely do
    if (/^\/(_next\/static|icons|samples)\//.test(url.pathname)) return event.respondWith(cacheFirst(request));
    if (request.mode === "navigate" || url.pathname === "/model/probe.json" || url.pathname === "/manifest.webmanifest") {
      return event.respondWith(staleWhileRevalidate(request));
    }
  } else if (CDN.test(request.url)) {
    event.respondWith(cacheFirst(request));
  }
});
