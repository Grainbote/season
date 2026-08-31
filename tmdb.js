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
