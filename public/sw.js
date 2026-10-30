const CACHE = /*VERSION*/ "salvage-dev" /*VERSION*/;
const CORE = [/*PRECACHE*/ "./", "./index.html" /*PRECACHE*/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function sameOriginGet(request) {
  if (request.method !== "GET") return false;
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!sameOriginGet(req)) return;
  const url = new URL(req.url);
  if (url.pathname.endsWith("/sample-bookmarks.html")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const key = new Request(req.url, { method: "GET", headers: req.headers, cache: "reload" });
        const hit = (await caches.match(req)) || (await caches.match(key)) || (await caches.match("./index.html"));
        const refresh = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(new Request(req.url, { method: "GET", headers: req.headers, cache: "reload" }), copy));
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    }),
  );
});

