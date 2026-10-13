const CACHE = "fe-aws-pwa-v18-20261013";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./data-init.js",
  "./data-a-1.js",
  "./data-a-2.js",
  "./data-a-3.js",
  "./data-a-4.js",
  "./data-a-5.js",
  "./data-a-6.js",
  "./data-b-1.js",
  "./data-b-2.js",
  "./data-extra.js",
  "./crash-old.js",
  "./crash-terms.js",
  "./crash-btrace.js",
  "./crash-security.js",
  "./crash-b-long.js",
  "./exam-a-plus-1.js",
  "./exam-a-plus-2.js",
  "./exam-b-plus-1.js",
  "./exam-b-plus-2.js",
  "./explain-overrides.js",
  "./fe-b-gap-1.js",
  "./fe-b-gap-2.js",
  "./aws-secure.js",
  "./aws-resilient.js",
  "./aws-performance.js",
  "./aws-cost.js",
  "./exam-a-wide-1.js",
  "./exam-a-wide-2.js",
  "./aws-extra-1.js",
  "./aws-extra-2.js",
  "./exam-a-wide-3.js",
  "./exam-a-wide-4.js",
  "./fe-b-gap-3.js",
  "./fe-b-gap-4.js",
  "./aws-scenario-secure-1.js",
  "./aws-scenario-resilient-1.js",
  "./aws-scenario-performance-1.js",
  "./aws-scenario-cost-1.js",
  "./exam-a-modern-1.js",
  "./fe-b-modern-1.js",
  "./aws-in-scope-breadth-1.js",
  "./guide-data.js",
  "./data-p-1.js",
  "./data-p-2.js",
  "./data-p-3.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== "opaque") {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});