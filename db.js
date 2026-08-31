/* Season — stockage local (IndexedDB). Tout vit dans le téléphone, rien n'est envoyé.
 *
 * Stores :
 *   shows    (clé = "tv:1399" ou "movie:603")
 *   episodes (clé = "tv:1399:1:2"  →  show : saison : épisode)
 */
window.DB = (() => {
  const NAME = "season";
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("shows")) {
          db.createObjectStore("shows", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("episodes")) {
          const ep = db.createObjectStore("episodes", { keyPath: "key" });
          ep.createIndex("byShow", "showKey", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  const asPromise = (req) =>
    new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

  return {
    async getShow(key) {
      return asPromise((await tx("shows", "readonly")).get(key));
    },
    async allShows() {
      return asPromise((await tx("shows", "readonly")).getAll());
    },
    async putShow(show) {
      show.updatedAt = Date.now();
      return asPromise((await tx("shows", "readwrite")).put(show));
    },
    async deleteShow(key) {
      const store = await tx("shows", "readwrite");
      await asPromise(store.delete(key));
      // épisodes liés
      const epStore = await tx("episodes", "readwrite");
      const idx = epStore.index("byShow");
      const keys = await asPromise(idx.getAllKeys(IDBKeyRange.only(key)));
      await Promise.all(keys.map((k) => asPromise(epStore.delete(k))));
    },
    async episodesOf(showKey) {
      const store = await tx("episodes", "readonly");
      return asPromise(store.index("byShow").getAll(IDBKeyRange.only(showKey)));
    },
    async putEpisodes(list) {
      const store = await tx("episodes", "readwrite");
      await Promise.all(list.map((e) => asPromise(store.put(e))));
    },
    async putEpisode(ep) {
      return asPromise((await tx("episodes", "readwrite")).put(ep));
    },
    async allEpisodes() {
      return asPromise((await tx("episodes", "readonly")).getAll());
    },
    async exportAll() {
      return { shows: await this.allShows(), episodes: await this.allEpisodes(), version: VERSION };
    },
    async importAll(data) {
      const s = await tx("shows", "readwrite");
      await Promise.all((data.shows || []).map((x) => asPromise(s.put(x))));
      const e = await tx("episodes", "readwrite");
      await Promise.all((data.episodes || []).map((x) => asPromise(e.put(x))));
    },
  };
})();
