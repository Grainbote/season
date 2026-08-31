/* Season — service worker. Rend l'appli utilisable hors-ligne.
 * - la coquille (html/css/js) : cache d'abord, réseau si absent
 * - TMDB (données + images) : on sert le cache et on rafraîchit en arrière-plan
 */
const VERSION = "season-v6";
const SHELL = VERSION + "-shell";
const RUNTIME = VERSION + "-runtime";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./db.js",
  "./tmdb.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) =>
      // `cache: "reload"` : on ignore le cache HTTP du navigateur pendant
      // l'install, sinon une nouvelle version du SW pourrait ré-enregistrer
      // les anciens fichiers encore en cache navigateur (max-age GitHub Pages).
      Promise.all(
        SHELL_FILES.map((url) =>
          fetch(url, { cache: "reload" }).then((r) => {
            if (r.ok) return c.put(url, r);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  const isTMDB =
    url.hostname === "api.themoviedb.org" || url.hostname === "image.tmdb.org";

  if (isTMDB) {
    e.respondWith(staleWhileRevalidate(request));
    return;
  }

  // même origine → coquille : cache d'abord
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetchAndPut(request, SHELL))
    );
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response(JSON.stringify({ results: [] }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchAndPut(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res && res.ok && request.url.startsWith(self.location.origin)) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    // pour une navigation hors-ligne, on retombe sur la page d'accueil
    if (request.mode === "navigate") {
      const shell = await caches.match("./index.html");
      if (shell) return shell;
    }
    return new Response("Hors-ligne", { status: 503 });
  }
}
