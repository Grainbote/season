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
  const backdrop = (p, size = "w780") => (p ? `${IMG}/${size}${p}` : null);

  // 1ʳᵉ bande-annonce YouTube de la fiche (sa clé), pour le bouton de la fiche
  function pickTrailer(videos) {
    const list = ((videos || {}).results || []).filter((v) => v.site === "YouTube");
    const best = list.find((v) => v.type === "Trailer") || list.find((v) => v.type === "Teaser") || list[0];
    return best ? best.key : "";
  }
  const still = (p) => (p ? `${IMG}/w300${p}` : null);

  return {
    hasKey,
    poster,
    backdrop,
    still,
    // taille au choix : w92 suffit pour une petite pastille, w154 pour les
    // grandes tuiles de « Où regarder » (écran 3x)
    logo: (p, size = "w92") => (p ? `${IMG}/${size}${p}` : null),
    profile: (p, size = "w185") => (p ? `${IMG}/${size}${p}` : null), // photo d'une personne

    // une page de titres d'un thème (themes.js), les plus populaires d'abord :
    // `genres` OU `keywords` (une requête par critère, fusionnées côté appli) ;
    // `prov` = seulement l'abonnement / gratuit sur ces plateformes (pas de location)
    // `sort` : "popularity.desc" (défaut), "vote_average.desc" (on relève alors le
    // nombre de votes minimum, sinon on remonte des inconnus notés 10/10), ou une
    // date de sortie — le champ de date n'a pas le même nom côté films et séries.
    async discoverPage(type, { genres = [], keywords = [], without = [] },
      { prov = [], page = 1, sort = "popularity.desc" } = {}) {
      const dateField = type === "tv" ? "first_air_date" : "primary_release_date";
      const sortBy = sort.startsWith("date.") ? `${dateField}.${sort.slice(5)}` : sort;
      const d = await call(`/discover/${type}`, {
        ...(genres.length ? { with_genres: genres.join("|") } : {}),
        ...(keywords.length ? { with_keywords: keywords.join("|") } : {}),
        ...(without.length ? { without_genres: without.join(",") } : {}),
        sort_by: sortBy,
        // tri par date : pas de titres qui ne sont pas encore sortis
        ...(sort.startsWith("date.") ? { [`${dateField}.lte`]: new Date().toISOString().slice(0, 10) } : {}),
        "vote_count.gte": sortBy.startsWith("vote_average") ? "300" : "20",
        include_adult: "false",
        page: String(page),
        ...(prov.length
          ? { with_watch_providers: prov.join("|"), watch_region: REGION,
              with_watch_monetization_types: "flatrate|free|ads" }
          : {}),
      });
      return {
        totalPages: Math.min(d.total_pages || 0, 500), // TMDB plafonne à 500
        results: (d.results || []).filter((x) => x.poster_path).map((x) => ({
          type,
          tmdbId: x.id,
          title: x.title || x.name,
          year: (x.release_date || x.first_air_date || "").slice(0, 4),
          overview: x.overview,
          poster: x.poster_path,
          popularity: x.popularity || 0,
          voteAverage: x.vote_average || 0,
          date: x.release_date || x.first_air_date || "",
        })),
      };
    },

    // Distribution d'une fiche. Côté séries, `aggregate_credits` réunit les rôles
    // de toutes les saisons (`credits` ne donne que la dernière) ; le rôle est alors
    // dans `roles[0].character`.
    async cast(type, id) {
      const d = await call(type === "tv" ? `/tv/${id}/aggregate_credits` : `/movie/${id}/credits`);
      return (d.cast || [])
        .slice(0, 20)
        .map((c) => ({
          id: c.id,
          name: c.name,
          role: type === "tv" ? (((c.roles || [])[0] || {}).character || "") : (c.character || ""),
          photo: c.profile_path || null,
        }));
    },

    // Tout ce dans quoi une personne a travaillé (séries + films), les plus
    // populaires d'abord, séparé en trois catégories (23/09/2026, page d'une
    // personne à onglets) : Acteur (`cast`), Réalisateur et Producteur (`crew`,
    // filtrés sur `job`). Un même titre peut revenir (plusieurs rôles/postes) dans
    // une même catégorie : on dédoublonne à l'intérieur de chacune.
    async personCredits(id) {
      const d = await call(`/person/${id}/combined_credits`);
      // Pas d'émissions de plateau (sa demande du 23/09/2026) : chez TMDB, venir
      // sur un plateau compte comme un crédit, et ces émissions sont si populaires
      // qu'elles monopolisaient le haut de la liste. Appliqué aux trois
      // catégories (un crédit de production sur un talk-show n'intéresse pas plus
      // qu'un rôle dedans).
      const plateau = new Set([10767, 10763, 10764]);
      // Côté acteur seulement : « Self » / « Himself »… échappe au filtre par genre
      // quand le jeu de plateau est rangé en simple « Comédie » (Spicks and Specks,
      // Hughesy We Have A Problem…).
      const soiMeme = /^(self|him ?self|her ?self|them ?selves|lui-même|elle-même)\b/i;
      const base = (x) => ({
        type: x.media_type,
        tmdbId: x.id,
        title: x.title || x.name,
        year: (x.release_date || x.first_air_date || "").slice(0, 4),
        poster: x.poster_path,
        popularity: x.popularity || 0,
        date: x.release_date || x.first_air_date || "",
      });
      const dedoublonne = (list) => {
        const vus = new Set();
        return list.filter((x) => !vus.has(x.type + x.tmdbId) && vus.add(x.type + x.tmdbId));
      };
      const parPop = (a, b) => (b.popularity || 0) - (a.popularity || 0);
      const media = (x) => (x.media_type === "tv" || x.media_type === "movie") && x.poster_path;
      const acteur = dedoublonne(
        (d.cast || [])
          .filter(media)
          .filter((x) => !(x.genre_ids || []).some((g) => plateau.has(g)))
          .filter((x) => !soiMeme.test((x.character || "").trim()))
          .map(base)
      ).sort(parPop);
      const crew = (d.crew || []).filter(media).filter((x) => !(x.genre_ids || []).some((g) => plateau.has(g)));
      const realisateur = dedoublonne(crew.filter((x) => x.job === "Director").map(base)).sort(parPop);
      // « Producteur » regroupe les variantes TMDB (Producer, Executive Producer,
      // Co-Producer…) : distinguer chacune aurait fait beaucoup d'onglets creux
      // pour peu d'intérêt ici.
      const producteur = dedoublonne(crew.filter((x) => /producer/i.test(x.job || "")).map(base)).sort(parPop);
      return { acteur, realisateur, producteur };
    },

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
      const d = await call(`/movie/${id}`, {
        append_to_response: "keywords,credits,videos",
        include_video_language: "fr,en",
      });
      return {
        key: "movie:" + id,
        type: "movie",
        tmdbId: id,
        title: d.title,
        year: (d.release_date || "").slice(0, 4),
        overview: d.overview,
        poster: d.poster_path,
        backdrop: d.backdrop_path || "", // bannière de la fiche
        tagline: d.tagline || "",
        director: ((d.credits || {}).crew || [])
          .filter((c) => c.job === "Director").map((c) => c.name).slice(0, 2).join(", "),
        // `directorPeople` (23/09/2026) : mêmes personnes que `director`, avec leur
        // id TMDB — pour rendre le nom cliquable vers sa page. `director` (texte)
        // reste affiché tel quel tant qu'une fiche déjà suivie n'a pas encore
        // récupéré ce nouveau champ (voir `staleMeta`/`fetchMeta`).
        directorPeople: ((d.credits || {}).crew || [])
          .filter((c) => c.job === "Director")
          .map((c) => ({ id: c.id, name: c.name, photo: c.profile_path || null }))
          .slice(0, 2),
        trailer: pickTrailer(d.videos),
        genres: (d.genres || []).map((g) => g.name),
        genreIds: (d.genres || []).map((g) => g.id),
        keywordIds: ((d.keywords || {}).keywords || []).map((k) => k.id), // → thèmes (themes.js)
        runtime: d.runtime || 0,
        popularity: d.popularity || 0, // → tri « Popularité » des listes
      };
    },

    async tv(id) {
      const d = await call(`/tv/${id}`, {
        append_to_response: "keywords,videos",
        include_video_language: "fr,en",
      });
      return {
        key: "tv:" + id,
        type: "tv",
        tmdbId: id,
        title: d.name,
        year: (d.first_air_date || "").slice(0, 4),
        overview: d.overview,
        poster: d.poster_path,
        backdrop: d.backdrop_path || "", // bannière de la fiche
        tagline: d.tagline || "",
        director: (d.created_by || []).map((c) => c.name).slice(0, 2).join(", "),
        // voir `directorPeople` de `movie()` : mêmes rôles, `created_by` donne déjà
        // l'id TMDB de chaque créateur.
        directorPeople: (d.created_by || [])
          .map((c) => ({ id: c.id, name: c.name, photo: c.profile_path || null }))
          .slice(0, 2),
        trailer: pickTrailer(d.videos),
        genres: (d.genres || []).map((g) => g.name),
        genreIds: (d.genres || []).map((g) => g.id),
        keywordIds: ((d.keywords || {}).results || []).map((k) => k.id), // → thèmes (themes.js)
        epRunTime: (d.episode_run_time && d.episode_run_time[0]) || 0,
        popularity: d.popularity || 0, // → tri « Popularité » des listes
        seasons: (d.seasons || [])
          .filter((s) => s.season_number > 0 && s.episode_count > 0)
          .map((s) => ({ number: s.season_number, name: s.name, count: s.episode_count })),
      };
    },

    // popularité seule d'un titre (rattrapage des fiches enregistrées avant
    // qu'on la stocke, pour le tri « Popularité »)
    async popularityOf(type, id) {
      const d = await call(`/${type}/${id}`);
      return d.popularity || 0;
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
    // `themes` ([{ keywords, weight }], un par thème précis de la fiche, du plus
    // central au moins central) : les titres qui partagent un de ces thèmes passent
    // en tête des deux rangées, chaque thème y prenant une place selon son poids.
    async related(type, id, { prov = [], skip = new Set(), themes = [] } = {}) {
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
      const merge = (...lists) => {
        const seen = new Set();
        return lists.flat().filter((x) => !seen.has(x.tmdbId) && seen.add(x.tmdbId));
      };
      const tmdbList = (r) => ((r || {}).results || []).filter(ok(type)).map((x) => map(x, type));
      const recos = tmdbList(d.recommendations);
      const similar = tmdbList(d.similar); // le plus faible (Ted Lasso → Star Trek…) : en dernier

      const srcIds = new Set((d.genres || []).map((g) => g.id));
      // « Drame » est partout : on ne s'en sert que s'il n'y a rien de plus parlant
      const noDrama = (ids) => (ids.length > 1 ? ids.filter((g) => g !== 18) : ids);
      // pas de dessin animé / jeunesse si le titre de départ n'en est pas
      const withoutFor = (ids) => [16, 10751, 10762].filter((g) => !srcIds.has(g) && !ids.includes(g));

      // titres ayant au moins un de ces genres (et un de ces mots-clés s'il y en a),
      // classés par nombre de genres en commun (le plus proche d'abord), la popularité
      // départageant
      const discover = async (t, ids, { keywords = [], pages = 5 } = {}) => {
        if (!ids.length && !keywords.length) return [];
        const extra = prov.length
          ? { with_watch_providers: prov.join("|"), watch_region: REGION,
              with_watch_monetization_types: "flatrate|free|ads" }
          : {};
        const results = await Promise.all(Array.from({ length: pages }, (_, i) => i + 1).map((page) =>
          call(`/discover/${t}`, {
            ...(ids.length ? { with_genres: ids.join("|") } : {}),
            ...(keywords.length ? { with_keywords: keywords.join("|") } : {}),
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
        const scored = results.flatMap((p) => p.results || [])
          .filter((x) => ok(t)(x) && !got.has(x.id) && got.add(x.id))
          .map((x, rank) => ({ x, rank, common: (x.genre_ids || []).filter((g) => want.has(g)).length }))
          .sort((a, b) => b.common - a.common || a.rank - b.rank);
        // le plus de genres en commun possible (jusqu'à 3), en gardant une rangée fournie
        let min = Math.min(3, ids.length);
        while (min > 1 && scored.filter((o) => o.common >= min).length < 8) min--;
        const out = scored.filter((o) => o.common >= min).map(({ x }) => map(x, t));
        out.total = (results[0] || {}).total_results || 0; // → rareté d'un thème
        return out;
      };

      // titres partageant un thème : une requête par thème (mots-clés + genres, ou
      // mots-clés seuls si trop peu) ; ceux qui cumulent plusieurs thèmes d'abord,
      // puis les thèmes se partagent la place **selon leur poids** (centralité dans
      // la fiche : Ted Lasso Sport 5 / amitié 2 → ~5 titres sport pour 2 d'amitié),
      // le plus rare passant devant à poids égal
      const themed = async (t, ids) => {
        if (!themes.length) return [];
        const lists = (await Promise.all(themes.map(async ({ keywords: kw, weight = 1 }) => {
          const both = await discover(t, ids, { keywords: kw, pages: 2 });
          const list = both.length >= 8 ? both : merge(both, await discover(t, [], { keywords: kw, pages: 2 }));
          return { list, weight, total: both.total || Infinity };
        }))).filter((o) => o.list.length).sort((a, b) => b.weight - a.weight || a.total - b.total);
        const count = new Map();
        lists.forEach((o) => o.list.forEach((x) => count.set(x.tmdbId, (count.get(x.tmdbId) || 0) + 1)));
        // tourniquet pondéré « lissé » : chaque tour, chaque thème encore fourni gagne
        // son poids en crédit ; le plus crédité donne un titre et paie le total
        const turns = [], credit = lists.map(() => 0), pos = lists.map(() => 0);
        for (;;) {
          const live = lists.map((o, i) => (pos[i] < o.list.length ? i : -1)).filter((i) => i >= 0);
          if (!live.length) break;
          let best = live[0];
          for (const i of live) {
            credit[i] += lists[i].weight;
            if (credit[i] > credit[best]) best = i;
          }
          credit[best] -= live.reduce((s, i) => s + lists[i].weight, 0);
          turns.push(lists[best].list[pos[best]++]);
        }
        return merge(turns.filter((x) => count.get(x.tmdbId) > 1), turns);
      };

      const other = type === "tv" ? "movie" : "tv";
      const crossIds = noDrama([...new Set([...srcIds].flatMap((g) => GENRE_BRIDGE[type][g] || []))]);
      const [sameThemed, crossThemed, crossGenres] = await Promise.all([
        themed(type, noDrama([...srcIds])),
        themed(other, crossIds),
        discover(other, crossIds),
      ]);
      // même type : recos TMDB qui partagent un thème → 6 autres titres du thème →
      // reste des recos TMDB → reste du thème → « similar ». Sans thème : recos puis
      // similar (comme avant).
      const inTheme = new Set(sameThemed.map((x) => x.tmdbId));
      let same = merge(recos.filter((x) => inTheme.has(x.tmdbId)), sameThemed.slice(0, 6),
        recos, sameThemed, similar);
      let cross = merge(crossThemed, crossGenres);

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
