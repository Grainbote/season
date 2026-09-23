/* Season — thèmes des fiches, sur le modèle des listes Letterboxd (un grand thème +
 * des sous-thèmes façon tropes). Détection via TMDB, séries ET films : un titre a un
 * thème si un de ses genres (du bon type) ou un de ses mots-clés TMDB y figure.
 * Pourquoi pas les seuls genres : TMDB n'a pas de genre « Romance » côté séries
 * (Off Campus = « Drame » seulement), mais ses mots-clés disent bien « romance ».
 * Ids de mots-clés vérifiés via /search/keyword (18/09/2026). */
window.THEMES = (() => {
  // mots-clés « romance » sans ambiguïté : romance, romantic drama, romcom (×2), teen romance, love story
  // (pas « love » 9673, « romantic » 324429, « slow burn », « second chance » : trop larges)
  const ROMANCE_CORE = [9840, 304976, 9799, 380026, 368947, 244886];

  // mots-clés des sous-thèmes de la romance (aussi rattachés au thème Romance)
  const ROMANCE_SUBS = [
    { id: "romcom", label: "Comédie romantique", keywords: [9799, 380026] },
    { id: "teen-romance", label: "Teen romance & premier amour", keywords: [368947, 157303] },
    { id: "to-lovers", label: "Ennemis / amis → amants", keywords: [282986, 282988] },
    { id: "fake-couple", label: "Faux couple", keywords: [357252, 303913] },
    { id: "tragic-love", label: "Amours interdites & tragiques",
      keywords: [3691, 10703, 255257, 165086, 10048, 128] },
    { id: "sapphic", label: "Romance saphique", keywords: [286187, 333351] },
    { id: "summer-romance", label: "Romance d'été & de vacances", keywords: [200129, 284235] },
    { id: "long-distance", label: "Amour à distance", keywords: [185332] },
    { id: "romantic-fantasy", label: "Romance fantastique", keywords: [323305] },
  ].map((t) => ({ ...t, parent: "romance" }));

  const list = [
    // Romance : sur la fiche, genre film OU mots-clés romance nets (+ tropes des sous-thèmes).
    // Page du thème plus stricte (`find`) : sinon des titres très populaires avec un
    // mot-clé romantique secondaire (Spider-Man, Better Call Saul…) passaient devant.
    { id: "romance", label: "Romance", movieGenres: [10749],
      keywords: [...ROMANCE_CORE, ...ROMANCE_SUBS.flatMap((s) => s.keywords)],
      find: {
        movie: [{ genres: [10749] }],
        tv: [{ keywords: ROMANCE_CORE, without: [80, 16, 10759, 10762] }],
      } },
    ...ROMANCE_SUBS,
    // Mots-clés élargis le 23/09/2026 (un seul par thème ratait trop de titres :
    // Ted Lasso = « football (soccer) », « professional sports »… mais pas « sports »).
    // Écartés car ambigus : doctor, nurse, coach (aussi l'autocar), village, band,
    // espionnage industriel/d'entreprise, mental hospital (→ horreur), survival show,
    // super power (Stranger Things n'est pas une série de super-héros).
    { id: "teen", label: "Teen & passage à l'âge adulte",
      keywords: [10683, 6270, 368947, 296608, 381664, 329126, 163037] },
    { id: "feel-good", label: "Feel good",
      keywords: [383896, 319357, 335803, 326774, 275276, 194088, 367611, 377619, 334465] },
    { id: "psy-thriller", label: "Thriller psychologique", movieGenres: [53],
      keywords: [12565, 382645, 301541] },
    { id: "whodunit", label: "Enquête & whodunit",
      keywords: [12570, 161982, 703, 268067, 207046, 364800, 381354, 15167, 160342] },
    { id: "true-crime", label: "True crime & tueurs", keywords: [33722, 10714, 227428, 384320] },
    { id: "true-story", label: "Histoires vraies & biopics",
      keywords: [376355, 9672, 5565, 360939, 367784, 367196, 381461, 379549] },
    { id: "period", label: "Historique & costumes", movieGenres: [36],
      keywords: [15060, 192772, 207928, 9920, 8250, 160279, 207941, 208244] },
    { id: "queer", label: "Queer",
      keywords: [158718, 250606, 363345, 264386, 1862, 286187, 333351, 372020,
        380747, 353629, 163037, 325223, 247821, 315385] },
    { id: "horror", label: "Surnaturel & horreur", movieGenres: [27],
      keywords: [6152, 315058, 3358, 12377, 12339, 162846, 41411, 3133, 186565] },
    { id: "dystopia", label: "Dystopie",
      keywords: [4565, 373759, 359337, 4458, 180440, 2137, 382466] },
    { id: "time-travel", label: "Voyage dans le temps", keywords: [4379, 10854] },
    { id: "spy", label: "Espionnage",
      keywords: [470, 5265, 4289, 217282, 14555, 190904, 383851, 332774, 18117, 356996, 309391, 298577] },
    { id: "superhero", label: "Super-héros", keywords: [9715, 155030, 272493, 180734] },
    { id: "space", label: "Espace", keywords: [9882, 3801, 252634, 14626, 252937, 3388, 3386] },
    { id: "fantasy", label: "Magie & fantasy", movieGenres: [14],
      keywords: [2343, 170362, 616, 177912, 5147, 12554, 3205] },
    { id: "sport", label: "Sport",
      keywords: [6075, 333328, 167882, 300423, 303084, 8635, 367589, 367587,
        13042, 192345, 223149, 244382, 282613, 579, 353108, 6496, 176752, 213225,
        1480, 209476, 245031, 1488, 2848, 6483, 289584, 5970, 206441, 2070, 274126,
        11672, 2702, 10671, 338748, 650, 5349] },
    { id: "music", label: "Musique & comédies musicales", movieGenres: [10402],
      keywords: [4344, 355890, 220201, 165241, 155710, 4048, 10229, 367196, 232260, 255059] },
    { id: "christmas", label: "Noël", keywords: [207317, 1991, 260365, 196450, 193048, 5570] },
    { id: "survival", label: "Survie", keywords: [10349, 9743, 328267, 327462, 342930] },
    { id: "heist", label: "Braquage",
      keywords: [10051, 191845, 250043, 40903, 159413, 304129, 642, 15363, 315792] },
    { id: "found-family", label: "Famille & amitié",
      keywords: [248927, 6054, 12279, 3230, 220669] },
    { id: "dark-comedy", label: "Comédie noire & satire",
      keywords: [10123, 8201, 383021, 11514, 169086] },
    { id: "medical", label: "Médical",
      keywords: [11612, 208788, 3262, 155068, 361943, 241541, 352474, 197829] },
    { id: "legal", label: "Judiciaire",
      keywords: [10909, 9798, 33519, 214780, 383047, 162813, 274297, 207900, 191199, 11038, 207240] },
    { id: "small-town", label: "Petite ville",
      keywords: [1415, 301206, 187614, 264313, 270325, 169977] },
    { id: "kdrama", label: "K-drama", keywords: [370168] },
    // grands genres TMDB : gardés, mais affichés après les thèmes plus précis
    { id: "comedy", label: "Comédie", movieGenres: [35], tvGenres: [35], broad: true },
    { id: "drama", label: "Drame", movieGenres: [18], tvGenres: [18], broad: true },
    { id: "crime", label: "Crime", movieGenres: [80], tvGenres: [80], broad: true },
    { id: "mystery", label: "Mystère", movieGenres: [9648], tvGenres: [9648], broad: true },
    { id: "scifi", label: "Science-fiction", movieGenres: [878], tvGenres: [10765], broad: true },
    { id: "action", label: "Action & aventure", movieGenres: [28, 12], tvGenres: [10759], broad: true },
    { id: "animation", label: "Animation", movieGenres: [16], tvGenres: [16], broad: true },
    { id: "documentary", label: "Documentaire", movieGenres: [99], tvGenres: [99], broad: true },
    { id: "war", label: "Guerre", movieGenres: [10752], tvGenres: [10768], broad: true },
    { id: "western", label: "Western", movieGenres: [37], tvGenres: [37], broad: true },
    { id: "family", label: "Famille", movieGenres: [10751], tvGenres: [10751, 10762], broad: true },
    { id: "reality", label: "Téléréalité", tvGenres: [10764], broad: true },
  ].map((t) => ({ movieGenres: [], tvGenres: [], keywords: [], ...t }));

  const byId = new Map(list.map((t) => [t.id, t]));
  const genresFor = (t, type) => (type === "tv" ? t.tvGenres : t.movieGenres);

  // repli pour les fiches enregistrées avant le 18/09/2026 (noms de genres TMDB fr-FR seulement)
  const GENRE_NAMES = {
    movie: { Action: 28, Aventure: 12, Animation: 16, "Comédie": 35, Crime: 80, Documentaire: 99,
      Drame: 18, Familial: 10751, Fantastique: 14, Histoire: 36, Horreur: 27, Musique: 10402,
      "Mystère": 9648, Romance: 10749, "Science-Fiction": 878, Thriller: 53, Guerre: 10752, Western: 37 },
    tv: { "Action & Adventure": 10759, Animation: 16, "Comédie": 35, Crime: 80, Documentaire: 99,
      Drame: 18, Familial: 10751, Kids: 10762, "Mystère": 9648, Reality: 10764,
      "Science-Fiction & Fantastique": 10765, "War & Politics": 10768, Western: 37 },
  };

  // thèmes détectés automatiquement (genreIds / keywordIds stockés sur la fiche)
  function autoThemes(show) {
    const g = new Set(show.genreIds && show.genreIds.length
      ? show.genreIds
      : (show.genres || []).map((n) => GENRE_NAMES[show.type === "tv" ? "tv" : "movie"][n]).filter(Boolean));
    const k = new Set(show.keywordIds || []);
    return list
      .filter((t) => genresFor(t, show.type).some((x) => g.has(x)) || t.keywords.some((x) => k.has(x)))
      .map((t) => t.id);
  }

  // thèmes d'une fiche : auto + ajouts manuels − retraits manuels ; précis d'abord
  function themesOf(show) {
    const removed = new Set(show.tagsRemove || []);
    const ids = new Set([...autoThemes(show), ...(show.tagsAdd || [])].filter((id) => !removed.has(id)));
    return list.filter((t) => ids.has(t.id)).sort((a, b) => !!a.broad - !!b.broad);
  }

  // critères de la page d'un thème pour un type : par défaut, genres du type OU mots-clés
  // (une requête chacun) ; un thème peut les préciser via `find`
  function findFor(t, type) {
    if (t.find && t.find[type]) return t.find[type];
    const out = [];
    if (genresFor(t, type).length) out.push({ genres: genresFor(t, type) });
    if (t.keywords.length) out.push({ keywords: t.keywords });
    return out;
  }

  return {
    list,
    findFor,
    get: (id) => byId.get(id),
    genresFor,
    autoThemes,
    themesOf,
    children: (id) => list.filter((t) => t.parent === id),
  };
})();
