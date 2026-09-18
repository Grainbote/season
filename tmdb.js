/* Season — accès à TMDB (themoviedb.org). Utilisé seulement quand il y a du réseau,
 * pour chercher un titre et récupérer affiche / épisodes / résumé. Les réponses sont
 * mises en cache par le service worker pour rester consultables hors-ligne. */
window.TMDB = (() => {
  const cfg = window.SEASON_CONFIG || {};
  const BASE = "https://api.themoviedb.org/3";
  const IMG = "https://image.tmdb.org/t/p";

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

    // suggestions « dans le même genre » pour une fiche : recommandations TMDB (+ titres
    // similaires en complément) du même type, et titres de l'autre type (films pour une
    // série, séries pour un film) aux genres correspondants via /discover.
    async related(type, id) {
      const d = await call(`/${type}/${id}`, { append_to_response: "recommendations,similar" });
      const map = (x, t) => ({
        type: t,
        tmdbId: x.id,
        title: x.title || x.name,
        year: (x.release_date || x.first_air_date || "").slice(0, 4),
        overview: x.overview,
        poster: x.poster_path,
      });
      const seen = new Set();
      const same = [...((d.recommendations || {}).results || []), ...((d.similar || {}).results || [])]
        .filter((x) => x.poster_path && !seen.has(x.id) && seen.add(x.id))
        .map((x) => map(x, type));

      const other = type === "tv" ? "movie" : "tv";
      let ids = [...new Set((d.genres || []).flatMap((g) => GENRE_BRIDGE[type][g.id] || []))];
      // « Drame » est partout : on ne s'en sert que s'il n'y a rien de plus parlant
      if (ids.length > 1) ids = ids.filter((g) => g !== 18);
      let cross = [];
      if (ids.length) {
        // pas de dessin animé / jeunesse si le titre de départ n'en est pas
        const srcIds = new Set((d.genres || []).map((g) => g.id));
        const without = [16, 10751, 10762].filter((g) => !srcIds.has(g) && !ids.includes(g));
        // titres ayant au moins un de ces genres, puis classés par nombre de genres
        // en commun (le plus proche d'abord), la popularité départageant
        const pages = await Promise.all([1, 2, 3, 4, 5].map((page) =>
          call(`/discover/${other}`, {
            with_genres: ids.join("|"),
            without_genres: without.join("|"),
            sort_by: "popularity.desc",
            "vote_count.gte": "200",
            include_adult: "false",
            page: String(page),
          }).catch(() => ({}))
        ));
        const want = new Set(ids);
        const got = new Set();
        const scored = pages.flatMap((p) => p.results || [])
          .filter((x) => x.poster_path && !got.has(x.id) && got.add(x.id))
          .map((x, rank) => ({ x, rank, common: (x.genre_ids || []).filter((g) => want.has(g)).length }))
          .sort((a, b) => b.common - a.common || a.rank - b.rank);
        // le plus de genres en commun possible (jusqu'à 3), en gardant une rangée fournie
        let min = Math.min(3, ids.length);
        while (min > 1 && scored.filter((o) => o.common >= min).length < 8) min--;
        cross = scored.filter((o) => o.common >= min).map(({ x }) => map(x, other));
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
