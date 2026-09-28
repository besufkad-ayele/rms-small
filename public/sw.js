/* Aramis Product service worker — cache shell for installable PWA */
const CACHE = "aramis-shell-v4";
const PRECACHE = [
  "/icons/android-chrome-192x192.png",
  "/icons/android-chrome-512x512.png",
  "/Aramis_Logo.png",
  "/Aramis_Logo_on_dark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept Next.js / Turbopack bundles — hashed chunks must always
  // come from the network so HMR and deploys cannot serve stale factories.
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) {
    return;
  }

  // Network-first for navigations; fall back to cache so the app opens offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/app")),
        ),
    );
    return;
  }

  // Cache-first for icons / static images only (not JS/CSS chunks)
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
