/* Season — accès à TMDB (themoviedb.org). Utilisé seulement quand il y a du réseau,
 * pour chercher un titre et récupérer affiche / épisodes / résumé. Les réponses sont
 * mises en cache par le service worker pour rester consultables hors-ligne. */
window.TMDB = (() => {
  const cfg = window.SEASON_CONFIG || {};
  const BASE = "https://api.themoviedb.org/3";
  const IMG = "https://image.tmdb.org/t/p";
  const REGION = cfg.REGION || "FR"; // pays pour les plateformes de streaming

  const hasKey = () => cfg.TMDB_KEY && cfg.TMDB_KEY !== "COLLE_TA_CLE_ICI";

  async function call(path, params = {}) {
    if (!hasKey()) throw new Error("no-key");
    const url = new URL(BASE + path);
    url.searchParams.set("api_key", cfg.TMDB_KEY);
    url.searchParams.set("language", cfg.LANG || "fr-FR");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await fetch(url);
    if (!r.ok) throw new Error("tmdb-" + r.status);
    return r.json();
  }

  // correspondance des genres TMDB séries ↔ films (ids différents d'un côté à l'autre ;
  // les genres sans équivalent — téléréalité, horreur… — sont ignorés)
  const SHARED = [16, 35, 80, 99, 18, 10751, 9648, 37];
  const GENRE_BRIDGE = { tv: {}, movie: {} };
  SHARED.forEach((g) => { GENRE_BRIDGE.tv[g] = [g]; GENRE_BRIDGE.movie[g] = [g]; });
  Object.assign(GENRE_BRIDGE.tv, { 10759: [28], 10765: [878], 10768: [10752], 10762: [10751] });
  Object.assign(GENRE_BRIDGE.movie, { 28: [10759], 12: [10759], 878: [10765], 14: [10765], 10752: [10768], 53: [9648] });

  const poster = (p, size = "w342") => (p ? `${IMG}/${size}${p}` : null);
  const still = (p) => (p ? `${IMG}/w300${p}` : null);

  return {
    hasKey,
    poster,
    still,
    logo: (p) => (p ? `${IMG}/w92${p}` : null),

    async searchMulti(query) {
      const data = await call("/search/multi", { query, include_adult: "false", page: "1" });
      return (data.results || [])
        .filter((x) => x.media_type === "tv" || x.media_type === "movie")
        .map((x) => ({
          type: x.media_type,
          tmdbId: x.id,
          title: x.title || x.name,
          year: (x.release_date || x.first_air_date || "").slice(0, 4),
          overview: x.overview,
          poster: x.poster_path,
          popularity: x.popularity,
        }))
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    },

    async movie(id) {
      const d = await call(`/movie/${id}`);
      return {
        key: "movie:" + id,
        type: "movie",
        tmdbId: id,
        title: d.title,
        year: (d.release_date || "").slice(0, 4),
        overview: d.overview,
        poster: d.poster_path,
        genres: (d.genres || []).map((g) => g.name),
        runtime: d.runtime || 0,
      };
    },

    async tv(id) {
      const d = await call(`/tv/${id}`);
      return {
        key: "tv:" + id,
        type: "tv",
        tmdbId: id,
        title: d.name,
        year: (d.first_air_date || "").slice(0, 4),
        overview: d.overview,
        poster: d.poster_path,
        genres: (d.genres || []).map((g) => g.name),
        epRunTime: (d.episode_run_time && d.episode_run_time[0]) || 0,
        seasons: (d.seasons || [])
          .filter((s) => s.season_number > 0 && s.episode_count > 0)
          .map((s) => ({ number: s.season_number, name: s.name, count: s.episode_count })),
      };
    },

    // état de diffusion + prochain épisode annoncé (pour l'onglet « À venir »)
    async tvSchedule(id) {
      const d = await call(`/tv/${id}`);
      const ne = d.next_episode_to_air;
      return {
        status: d.status || "", // "Returning Series", "Ended", "Canceled", "In Production"…
        nextSeason: ne ? ne.season_number : null,
        nextEp: ne
          ? { season: ne.season_number, episode: ne.episode_number, name: ne.name, airDate: ne.air_date || "" }
          : null,
      };
    },

    // plateformes de streaming proposées par TMDB dans le pays (séries + films fusionnés),
    // dans l'ordre d'importance donné par TMDB
    async providers() {
      const [tv, mv] = await Promise.all(["tv", "movie"].map((t) =>
        call(`/watch/providers/${t}`, { watch_region: REGION })
      ));
      const byId = new Map();
      for (const p of [...(tv.results || []), ...(mv.results || [])]) {
        const prio = (p.display_priorities || {})[REGION] ?? p.display_priority ?? 999;
        const cur = byId.get(p.provider_id);
        if (!cur || prio < cur.prio) {
          byId.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path, prio });
        }
      }
      return [...byId.values()].sort((a, b) => a.prio - b.prio);
    },

    // plateformes (ids) où un titre se regarde en abonnement ou gratuitement dans le pays
    async availableOn(type, id) {
      const r = await this.whereToWatch(type, id);
      return [...new Set([...r.flatrate, ...r.free, ...r.ads].map((p) => p.id))];
    },

    // « Où regarder » d'une fiche : plateformes par mode (données JustWatch via TMDB)
    async whereToWatch(type, id) {
      const d = await call(`/${type}/${id}/watch/providers`);
      const r = (d.results || {})[REGION] || {};
      const list = (k) => (r[k] || [])
        .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
        .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));
      return { link: r.link || "", flatrate: list("flatrate"), free: list("free"), ads: list("ads"),
               rent: list("rent"), buy: list("buy") };
    },

    // suggestions « dans le même genre » pour une fiche : recommandations TMDB (+ titres
    // similaires en complément) du même type, et titres de l'autre type (films pour une
    // série, séries pour un film) aux genres correspondants via /discover.
    // `prov` (ids de plateformes) : ne garder que ce qui y est disponible.
    // `skip` (clés « type:id ») : titres à ne pas proposer (déjà vus…).
    async related(type, id, { prov = [], skip = new Set() } = {}) {
      const d = await call(`/${type}/${id}`, { append_to_response: "recommendations,similar" });
      const map = (x, t) => ({
        type: t,
        tmdbId: x.id,
        title: x.title || x.name,
        year: (x.release_date || x.first_air_date || "").slice(0, 4),
        overview: x.overview,
        poster: x.poster_path,
      });
      const ok = (t) => (x) => x.poster_path && !skip.has(`${t}:${x.id}`) && x.id !== +id;
      const seen = new Set();
      let same = [...((d.recommendations || {}).results || []), ...((d.similar || {}).results || [])]
        .filter((x) => ok(type)(x) && !seen.has(x.id) && seen.add(x.id))
        .map((x) => map(x, type));

      const srcIds = new Set((d.genres || []).map((g) => g.id));
      // « Drame » est partout : on ne s'en sert que s'il n'y a rien de plus parlant
      const noDrama = (ids) => (ids.length > 1 ? ids.filter((g) => g !== 18) : ids);
      // pas de dessin animé / jeunesse si le titre de départ n'en est pas
      const withoutFor = (ids) => [16, 10751, 10762].filter((g) => !srcIds.has(g) && !ids.includes(g));

      // titres ayant au moins un de ces genres, classés par nombre de genres en commun
      // (le plus proche d'abord), la popularité départageant
      const discover = async (t, ids) => {
        if (!ids.length) return [];
        const extra = prov.length
          ? { with_watch_providers: prov.join("|"), watch_region: REGION,
              with_watch_monetization_types: "flatrate|free|ads" }
          : {};
        const pages = await Promise.all([1, 2, 3, 4, 5].map((page) =>
          call(`/discover/${t}`, {
            with_genres: ids.join("|"),
            without_genres: withoutFor(ids).join("|"),
            sort_by: "popularity.desc",
            "vote_count.gte": prov.length ? "50" : "200",
            include_adult: "false",
            page: String(page),
            ...extra,
          }).catch(() => ({}))
        ));
        const want = new Set(ids);
        const got = new Set();
        const scored = pages.flatMap((p) => p.results || [])
          .filter((x) => ok(t)(x) && !got.has(x.id) && got.add(x.id))
          .map((x, rank) => ({ x, rank, common: (x.genre_ids || []).filter((g) => want.has(g)).length }))
          .sort((a, b) => b.common - a.common || a.rank - b.rank);
        // le plus de genres en commun possible (jusqu'à 3), en gardant une rangée fournie
        let min = Math.min(3, ids.length);
        while (min > 1 && scored.filter((o) => o.common >= min).length < 8) min--;
        return scored.filter((o) => o.common >= min).map(({ x }) => map(x, t));
      };

      const other = type === "tv" ? "movie" : "tv";
      const crossIds = noDrama([...new Set([...srcIds].flatMap((g) => GENRE_BRIDGE[type][g] || []))]);
      let cross = await discover(other, crossIds);

      if (prov.length) {
        // indique sur quelle(s) plateforme(s) de la liste chaque titre se trouve
        const want = new Set(prov);
        const tag = async (list, max) => {
          const out = [];
          for (let i = 0; i < list.length && out.length < max; i += 8) {
            const part = await Promise.all(list.slice(i, i + 8).map(async (x) => {
              const on = await this.availableOn(x.type, x.tmdbId).catch(() => []);
              return { ...x, on: on.filter((p) => want.has(p)) };
            }));
            out.push(...part.filter((x) => x.on.length));
          }
          return out.slice(0, max);
        };
        same = await tag(same.slice(0, 40), 15);
        if (same.length < 10) {
          // pas assez de recommandations dispo : complète par genre sur ces plateformes
          const have = new Set(same.map((x) => x.tmdbId));
          const more = (await discover(type, noDrama([...srcIds]))).filter((x) => !have.has(x.tmdbId));
          same.push(...(await tag(more.slice(0, 20), 15 - same.length)));
        }
        cross = await tag(cross.slice(0, 20), 15);
      }
      return { same, cross };
    },

    async season(tvId, number) {
      const d = await call(`/tv/${tvId}/season/${number}`);
      return (d.episodes || []).map((e) => ({
        season: number,
        episode: e.episode_number,
        name: e.name,
        overview: e.overview,
        still: e.still_path,
        airDate: e.air_date || "",
        runtime: e.runtime || 0,
      }));
    },
  };
})();
