# Season — état du projet

Appli web (PWA) pour suivre les **séries et films** que Clothilde regarde, façon TV Time.
Mobile d'abord, thème sombre. **Toutes les données vivent dans le navigateur du
téléphone** (IndexedDB) — rien n'est envoyé nulle part.

## Où ça vit

- **Code** : `C:\Users\borto\Documents\Season\` (dans Documents, pas le Bureau :
  dépôt git, on évite la synchro Google Drive — voir la mémoire
  `google-drive-verrouille-ecritures-lot`).
- **En ligne** : `https://grainbote.github.io/season/` (GitHub Pages, dépôt public
  `Grainbote/season`, déployé depuis la branche `main`, dossier racine).
- **Aperçu local** : `node server.js` (port 3007) ou le lanceur commun si intégré.
  Sert uniquement à tester sur le PC ; l'usage réel se fait sur l'adresse GitHub Pages.

## Pile technique

HTML/CSS/JS pur, **aucun framework, aucun outil de build** (comme ses autres projets).
Le dépôt public ne contient que la coquille de l'appli.

- `index.html` — structure, barre du haut (⚙ Réglages), 8 onglets (Séries, À venir,
  Films, Recherche, **Favoris**, **Journal**, **Listes**, Stats)
- `app.css` — thème sombre, mobile d'abord (max 560 px, safe-area iOS/Android) ; accent **orange** `#ff8a3d` (texte `--on-accent` foncé dessus), `--warn` rouge — depuis le 18/09/2026 (avant : bleu-violet). L'icône de l'appli est restée bleu-violet (`outils/creer-icones.ps1`)
- `app.js` — toute la logique (navigation par pile de vues, rendu des écrans)
- `db.js` — couche IndexedDB (stores `shows`, `episodes`)
- `tmdb.js` — accès à l'API TMDB (recherche, détails, épisodes)
- `config.js` — **la clé TMDB** (v3 auth). Publique par nature (clé gratuite,
  lecture seule). À remplir avant que la recherche fonctionne.
- `sw.js` — service worker : coquille en cache-first, TMDB en stale-while-revalidate
  (données + affiches consultables hors-ligne une fois vues)
- `manifest.webmanifest` — installation PWA
- `icons/` — générées par `outils/creer-icones.ps1` (System.Drawing, sans outil externe)
- `server.js` — petit serveur statique local pour l'aperçu PC

## Fonctionnalités

### Onglets Séries et Films (listes)
- Depuis le 18/09/2026, l'ancien onglet « Listes » est scindé (son choix) :
  **Séries** (`data-tab="listes"`, `renderSeries`) ne montre que les séries,
  **Films** (`data-tab="films"`, `renderFilms`) que les films. Même `renderListes`,
  paramétré par `listesKind` ; filtre actif retenu par type (`listesFilters`).
- Segmented **À voir / En cours / Vu** avec compteurs (Films : **À voir / Vu**
  seulement ; un film resté « en cours » compte comme « à voir »).
- **Tri** (menu déroulant, choix retenu dans `localStorage` `season.sort`) :
  *Vu récemment* (défaut — date du dernier épisode coché, ou date du film ;
  calculée en parcourant tous les épisodes), *Ajout récent* (`createdAt`),
  *Titre A→Z*, **Popularité** (depuis le 20/09/2026). Même menu sur Favoris
  (`season.favSort`) — un seul `sortBar` / `sortersFor` partagé.
- **Popularité** = `show.popularity` (TMDB), enregistrée depuis le 20/09/2026 par
  `TMDB.tv/movie` (donc mise à jour à chaque rafraîchissement de fiche). Les fiches
  plus anciennes ne l'ont pas : elles se rangent **en dernier**, et une barre sous le
  tri propose « ↻ Récupérer » (`popularityBar` → `TMDB.popularityOf`, paquets de 12,
  compteur). L'écriture passe par `DB.putShowQuiet` pour **ne pas toucher
  `updatedAt`** (sinon le tri « Vu récemment » serait chamboulé). `show.lastWatchedAt` est tenu à jour par `recomputeAndSave` mais
  le tri « vu récemment » recalcule depuis `DB.allEpisodes()` pour couvrir les
  données importées.
- Grille d'affiches. **Onglets Séries et Films : affiches seules** (titre, `x/y épisodes`
  et « Film » masqués via `.poster-grid.no-caption`, demandé le 18/09/2026), barre de
  progression gardée sur l'affiche des séries ; titre en `aria-label`. Affiches des deux onglets à **angles droits** (pas d'arrondi) et **sans étiquette Série/Film** (inutile, déjà rangé par onglet) — 18/09/2026.
- Le **statut d'une série est déduit** de la progression : 0 épisode = À voir,
  au moins 1 = En cours, tous = Vu. Le passage est automatique.

### Onglet Recherche
- Recherche TMDB `search/multi` (séries + films), triée par popularité, en français.
- Résultat → fiche. Plus de bouton « Ajouter à mes listes » (retiré le 18/09/2026) :
  une fiche **pas encore suivie** montre directement **À voir / Vu** ; un tap ajoute le
  titre avec ce statut (`addWithStatus` : récupère les épisodes d'une série, « Vu » sur
  une série coche tous ses épisodes, sans confirmation puisqu'elle vient de choisir).

### Fiche
- Affiche, année, résumé. **Thèmes = pastilles cliquables** (`.genre-tag`) → page thème (voir Thèmes).

### Thèmes (`themes.js`, depuis le 18/09/2026 — remplacent les genres TMDB)
- **Pourquoi** : TMDB n'a **pas de genre Romance côté séries** (Off Campus = « Drame »,
  Sterling Point = « Mystère, Drame ») ; ses **mots-clés** le disent (romance 9840,
  romantic drama 304976). Classement **sur le modèle des listes Letterboxd** (grand thème +
  sous-thèmes façon tropes) — Letterboxd = modèle seulement, pas de collecte de ses listes
  (films seulement + interdit par ses conditions ; sa recherche renvoie 403 en direct).
- `THEMES.list` : ~40 thèmes `{id,label,movieGenres,tvGenres,keywords,parent?,broad?,find?}`.
  Romance + 9 sous-thèmes (comédie romantique, teen romance, ennemis/amis → amants, faux
  couple, amours interdites & tragiques, saphique, été & vacances, à distance, fantastique),
  puis Teen, Feel good, Thriller psy, Enquête, True crime, Histoires vraies, Historique, Queer,
  Surnaturel & horreur, Dystopie, Voyage dans le temps… et les grands genres (`broad`, en dernier).
  Ids de mots-clés vérifiés via `/search/keyword`. Écartés car trop larges : love 9673,
  romantic 324429, slow burn 277551, second chance 34004 (ramenaient The Brutalist…).
- **Détection** (`autoThemes`) : genres du type OU mots-clés de la fiche. `TMDB.tv/movie`
  demandent `append_to_response=keywords` → `show.genreIds`, `show.keywordIds`. Fiche
  suivie sans `keywordIds` = périmée → complétée en tâche de fond à l'ouverture. Repli
  noms fr-FR → ids (`GENRE_NAMES`) pour les vieilles fiches.
- **Fiche** : pastilles = `themesOf(show)` (précis d'abord). Fiche suivie : **✎** → tous les
  thèmes à cocher ; `show.tagsAdd` / `show.tagsRemove` (relatifs à l'auto), prioritaires.
- **Page thème** (`renderTheme(fromType, themeId)`) : Séries / Films, **pastilles des
  sous-thèmes** (ou « ↑ Tout Romance » + voisins depuis un sous-thème), note plateformes.
  Critères `THEMES.findFor` : par défaut genres OU mots-clés (une requête `/discover`
  chacun, `TMDB.discoverPage`, fusion par popularité).
- **Seulement ce qui est dispo sur ses plateformes** (depuis le 20/09/2026, à sa
  demande) : `/discover` filtre déjà (`with_watch_providers`, abonnement / gratuit /
  pub), et chaque titre est **revérifié un par un** (`/watch/providers` via
  `availableOn` + `onlyOnMyProviders`, paquets de 8, cache session `availCache`) →
  faux positifs écartés et **logo de la plateforme** sur chaque affiche. Ses
  « à voir » mis en tête passent **le même filtre** (avant, ils s'affichaient quelle
  que soit la plateforme — c'est ce qu'elle voyait). Sans plateforme choisie :
  rien n'est filtré, comme avant. La grille est redessinée d'un bloc à chaque
  `paint()` (ses « à voir » arrivent après la vérification et restent en tête). **Romance plus stricte** (`find`) :
  films = genre Romance seul ; séries = mots-clés romance nets **sans** Crime / Animation /
  Action / Kids (sinon Spider-Man, Better Call Saul… passaient devant). En tête : ses
  « à voir » du thème (auto ou ajouté) ; vus / en cours masqués ; thème retiré à la main
  → titre exclu. « Voir plus », cache session `themeCache`, onglet retenu `themeTab`.
  **Plus d'étiquette « À voir »** sur les affiches (retirée le 20/09/2026, `recoCard`
  n'a plus de paramètre `status` ; styles `.badge-type` / `.badge-list` supprimés).
### Onglet Favoris (depuis le 20/09/2026)
- Placé **après Recherche**. Liste les fiches marquées `show.favorite`.
- Marquage : bouton **♥ Ajouter aux favoris / ♥ Favori** sur la fiche (sous le
  sous-titre, visible seulement sur une fiche suivie) ; `renderFavoris`.
- Segmented **Tout / Séries / Films** avec compteurs (`season.favKind`), même barre
  de tri que les listes (`season.favSort`, défaut Titre A→Z) et même grille
  d'affiches seules (`.poster-grid.no-caption`).
- **Favoris repris des imports** (`seedFavorites`, une seule fois, drapeau
  `localStorage season.favSeed`) : toute fiche dont l'avis contient « Favori sur
  TV Time », « Film favori sur Letterboxd » ou « Aimé sur Letterboxd » est cochée
  au 1ᵉʳ lancement (son choix du 20/09/2026 : tout reprendre, y compris les films
  aimés sur Letterboxd) ; toast du nombre repris. Elle peut décocher ensuite.
- `favorite` est un champ de `shows` → inclus dans l'export / import.

### Onglet Journal (depuis le 20/09/2026) — le « Diary » de Letterboxd
- Tout ce qu'elle a coché, **du plus récent au plus ancien, groupé par mois**
  (en-tête de mois collant), une ligne = jour dans un carré + affiche + titre ·
  année + sa note en étoiles. Tap → fiche. `renderJournal`, styles `.diary-*`.
- **Un film = une ligne** (`watchedAt` du film). **Les épisodes d'une même série
  cochés le même jour sont réunis** en une ligne (`S1E1 → S1E4 · 4 épisodes`,
  ou `S1E5 · titre` s'il n'y en a qu'un) — sinon une soirée de binge en ferait huit.
- Affiché par paquets de 60 (`JOURNAL_PAGE`, bouton « Voir plus »).
- ⚠ Les ~1190 films enregistrés en masse à son inscription Letterboxd (sept. 2023)
  forment un gros bloc à cette date : c'est la date de l'export, pas la vraie.
  Un titre sans `watchedAt` n'apparaît pas.

### Onglet Listes (depuis le 20/09/2026) — les listes de Letterboxd
- Store IndexedDB **`lists`** (base passée en **version 2** ; les bases en v1
  reçoivent juste le nouveau store) : `{ id, name, description, items: [], createdAt,
  updatedAt }`, `items` = `{type, tmdbId, title, year, poster}` — le titre est
  **recopié** dans la liste, qui reste donc lisible hors-ligne et même si le titre
  n'est pas (ou plus) suivi.
- `renderMesListes` : bouton « ＋ Nouvelle liste » (`prompt` pour le nom), une carte
  par liste (nom, compteur « N films / N séries / N titres », bande des 8 premières
  affiches, description).
- `renderListe(id)` : nom et description **modifiables sur place** (enregistrés à la
  volée, comme l'avis d'une fiche), grille d'affiches, bouton **✎ Modifier** qui fait
  apparaître une croix sur chaque affiche pour retirer un titre, et « Supprimer la
  liste » (les titres eux-mêmes ne sont pas touchés).
- **Fiche → ≡ Listes** (`listPicker`, à côté du ♥) : pastilles des listes à cocher /
  décocher + « ＋ Nouvelle liste ». Marche aussi sur une fiche **pas encore suivie**.
- Les listes sont dans l'**export / import** de sauvegarde (`data.lists` ; une
  sauvegarde d'avant, sans ce champ, s'importe sans erreur).
- Pas de réordonnancement manuel des titres en v1 (ordre d'ajout).

### Barre d'onglets qui défile (depuis le 20/09/2026)
- 8 onglets ne tiennent pas sur 360 px : `#tabbar` déborde (`overflow-x`, onglets
  `flex: 1 0 78px`, barre de défilement masquée) et l'onglet actif est recentré par
  `setTab` (`scrollLeft` direct : ni `scrollIntoView` ni `behavior: "smooth"` ne
  bougent dans cette barre `position: fixed`).
- Défilement **piloté par app.js** (`touch-action: none`, pointer events) : rester
  appuyé ~300 ms prend la barre en main (courte vibration, onglets estompés
  `.is-panning`), un glissement de plus de 6 px la prend aussi ; molette = défilement
  horizontal sur PC.
- Le **choix de l'onglet se fait au relâchement**, sur l'onglet touché à l'appui :
  toucher un onglet à moitié visible le fait défiler sous le doigt et le `click` du
  navigateur serait perdu (cible différente entre appui et relâché). Le `click` reste
  écouté pour le clavier, ignoré s'il suit un relâchement déjà traité (`panDone`) ou
  un défilement (`panMoved`).

### Réglages (bouton ⚙ en haut à droite)
- **Vignettes par ligne** (grilles Séries / Films) : Auto · 2 · 3 · 4 · 5. `localStorage`
  `season.cols` → attribut `html[data-cols]` (CSS en fin d'`app.css`) ; Auto = règle
  d'origine (3, ou 2 si ≤ 400 px). À 4-5 : texte réduit.
  Inclus dans l'export (`settings.cols`).
- **Mes plateformes de streaming** : liste TMDB `/watch/providers/{tv,movie}`
  (région FR, fusionnée, ordre de priorité TMDB, 40 premières + recherche),
  cases à cocher + puces des choisies. Stocké dans `localStorage`
  `season.providers` = `[{id,name,logo}]` ; vide = pas de filtre.
- Inclus dans l'**export** de sauvegarde (`settings.providers`) et restauré à l'import.

### Onglet À venir
- Prochaines sorties d'épisodes des séries suivies, groupées par date (relatif
  jusqu'à 7 j, sinon jour + date). Tap → fiche.
- **Scan à la demande** (`scanUpcoming`, bouton « ↻ Actualiser ») : le 1ᵉʳ scan
  passe en revue **toutes** les séries (`/tv/{id}` → `status` + `next_episode_to_air`,
  puis `/season/{n}` pour la liste complète des épisodes à venir de cette saison),
  pool de 12, barre de progression. ~400 séries la 1ʳᵉ fois.
- Ensuite : les séries `Ended`/`Canceled` (champ `show.tmdbStatus`) sont **exclues**
  des scans suivants ; rafraîchissement auto en arrière-plan à l'ouverture de
  l'onglet si le dernier scan date de > 6 h (ne re-vérifie que les séries encore
  en production, ~30-40 appels).
- Stocké sur `show` : `tmdbStatus`, `upcoming: [{season,episode,name,airDate}]`,
  `nextScanAt`.

### Onglet Stats
- Cartes : temps de visionnage total, épisodes vus, films vus, séries finies · en cours.
- **Genres favoris** (barres) — exclut les titres encore « à voir ».
- **Activité sur 12 mois** (barres) — d'après la date où chaque épisode/film a été coché.
- **Sauvegarde** : export JSON (fichier téléchargé) et import — pour changer de
  téléphone ou se prémunir d'un effacement du navigateur. L'import accepte aussi
  un export TV Time **converti** au format Season (voir ci-dessous).

## Import TV Time (fait une fois, le 31/08/2026)

Son compte TV Time exporté le 10/07/2026 : `tvtime-export-2026-07-10.zip`
(`tvtime-series-*.json`, `tvtime-movies-*.json`, `tvtime-summary-*.html`) —
414 séries, 1 film, ~8280 épisodes vus. Chaque titre a un id **TVDB** (+ parfois
IMDb) dans l'export.

Conversion : `scratchpad/convert.mjs` (script jetable, pas dans le dépôt).
- `/find/{tvdb}?external_source=tvdb_id` puis repli IMDb puis `/search/tv` →
  récupère l'id **TMDB** (les 415 titres ont été reconnus, 0 échec).
- `/tv/{id}` → affiche, genres, résumé, année, `episode_run_time`, structure des
  saisons (nom + nombre d'épisodes).
- Les épisodes **vus** viennent de l'export TV Time lui-même (numéro + `watched_at`),
  pas d'appel `/season/*`. Seuls les épisodes vus sont écrits (les autres sont
  décochés par défaut dans l'appli).
- Sortie : `season-import-tvtime.json` au format `{version, shows, episodes}` —
  importable tel quel via **Stats → Importer une sauvegarde**.
- Pas de note importée (TV Time n'en met pas dans l'export) ; les 17 favoris TV
  Time reçoivent l'avis « ★ Favori sur TV Time ».
- `metaAt`/`epAt` = date d'import → l'appli ne re-télécharge pas tout TMDB au
  premier lancement ; le rafraîchissement se fait au fil des ouvertures de fiches.
- **Temps de visionnage des stats = approximatif** pour l'import : `episode_run_time`
  est souvent vide chez TMDB, l'appli retombe alors sur 40 min/épisode.

## Import Letterboxd (fait une fois, le 18/09/2026)

Export `letterboxd-cloborto-2026-09-18-17-49-utc.zip` (Téléchargements) : watched.csv
(1640), watchlist.csv (910), ratings.csv (1618, demi-étoiles), diary.csv (442 dates
de visionnage), reviews.csv, likes/films.csv, profile.csv (4 films favoris).
Scripts jetables (scratchpad, pas dans le dépôt) : `convert-lb.mjs`, `add-series.mjs`,
`inject.mjs`.
- **Id TMDB exact** lu sur la page Letterboxd de chaque film (`boxd.it/…` →
  `data-tmdb-id`), pas de recherche par titre. 2538/2550 reconnus ; les 12 restants
  étaient des **séries** (Letterboxd ne donne pas d'id TMDB aux séries) → retrouvées
  par `/search/tv` et ajoutées comme séries (11 « à voir », DJ Mehdi vue, 6 épisodes).
- Vu → `watchedMovie`, date = dernière « Watched Date » du journal, sinon date
  d'enregistrement dans watched.csv (⚠ ~1190 films enregistrés en masse en
  sept. 2023 à son inscription : leur date = celle-là, pas la vraie).
- Watchlist → « à voir ». Note Letterboxd → `rating` (demi-étoiles gardées).
  Critiques → avis ; film aimé → « ♥ Aimé sur Letterboxd », favori de profil →
  « ★ Film favori sur Letterboxd » (comme les favoris TV Time).
- **Injecté directement dans le téléphone** (DevTools via adb, fusion sans écraser),
  après sauvegarde complète du téléphone :
  `Téléchargementsseason-sauvegarde-avant-letterboxd-2026-09-18.json`. Fichier
  converti gardé : `Téléchargementsseason-import-letterboxd.json` (importable via
  Stats → Importer). Après import : 2539 films (1640 vus, 899 à voir), 428 séries.
- Champ `source: "letterboxd"` sur les fiches importées.

## Position au retour

`go()` mémorise `window.scrollY` (+ `view.scrollTop`) sur l'écran qu'on quitte ; `back()`
prépare `pendingScroll`, que `render()` applique au 1ᵉʳ rendu non-spinner via
`restoreScroll` : réessaie toutes les 30 ms (pas `requestAnimationFrame`, bloqué quand
la page est masquée) jusqu'à ce que la page soit assez haute (contenu chargé après
coup, ex. vue genre), 2,5 s max ; abandon si elle touche l'écran ou change d'écran
(`navSeq`). `history.scrollRestoration = "manual"`. Changer d'onglet repart en haut.

## Bouton retour d'Android

Géré dans `app.js` (`armBackTrap`, `popstate`) : une entrée d'historique « piège »
(`{seasonTrap:true}`) au-dessus de la racine ; chaque retour système la consomme →
fiche/réglages : écran précédent ; autre onglet : Séries ; Séries : toast
« Appuie encore pour quitter » (2,2 s), 2ᵉ appui = sortie. Le piège est remis après
chaque retour géré. Avant (jusqu'au 18/09/2026), retour fermait l'appli.

## Modèle de données (IndexedDB `season`, version 2)

- `shows`, clé `key` = `tv:<tmdbId>` ou `movie:<tmdbId>` : `type`, `title`, `year`,
  `poster`, `overview`, `genres[]`, `status`, `rating`, `review`, `seasons[]`
  (`{number,name,count}`), `totalEpisodes`, `watchedEpisodes`, `epRunTime`,
  `runtime` (film), `watchedMovie`, `favorite`, `popularity`, `createdAt`, `updatedAt`,
  `metaAt`, `epAt`.
- `lists`, clé `id` = `list:<horodatage>-<aléa>` : `name`, `description`, `items[]`
  (`{type,tmdbId,title,year,poster}`), `createdAt`, `updatedAt`.
- `episodes`, clé `key` = `tv:<id>:<saison>:<épisode>`, index `byShow` :
  `showKey`, `season`, `episode`, `name`, `runtime`, `airDate`, `still`,
  `watched`, `watchedAt`.

## Rafraîchissement TMDB

- **Ouverture d'une fiche suivie = instantanée** depuis IndexedDB (depuis le 18/09/2026 ;
  avant : spinner + attente TMDB + 2ᵉ rendu complet quand les épisodes arrivaient → la
  page « sautait »). La mise à jour TMDB se fait après, en tâche de fond, puis
  `draw(true)` redessine **sur place** : position de défilement, saisons ouvertes et
  blocs « Où regarder » / suggestions conservés ; pas de redessin si elle est en train
  d'écrire (focus dans un champ). `navSeq` (incrémenté par `go`/`back`) évite qu'un
  rendu tardif écrase un autre écran. `detailNode` ne fait plus `render()` lui-même.
- Fiche pas encore suivie : spinner seulement si TMDB met > 150 ms.
- « Où regarder » : place réservée (squelette) pendant le chargement + cache mémoire
  `wtwCache` par fiche.

- Métadonnées d'une fiche : re-fetch si en ligne et `metaAt` > 12 h.
- Épisodes d'une série suivie : re-sync en tâche de fond si en ligne et `epAt` > 12 h
  (l'état `watched` de chaque épisode est préservé).

## Déploiement

```
git add -A && git commit -m "..." && git push
```
GitHub Pages redéploie tout seul depuis `main`. `.nojekyll` présent (sinon Pages
ignorerait les fichiers utiles). Chemins tous **relatifs** car le site est servi
sur le sous-chemin `/season/`.

Mettre à jour le service worker : changer `VERSION` dans `sw.js` à chaque
modification de la coquille, sinon l'ancienne version reste en cache sur le téléphone.
L'install du SW fetch les fichiers avec `cache: "reload"` — sans ça, un nouveau SW
pouvait ré-enregistrer d'anciens fichiers encore dans le cache HTTP du navigateur
(GitHub Pages sert `max-age=600`), symptôme vu le 31/08/2026 (CSS pas à jour sur
le tél malgré un nouveau VERSION).

## Pièges rencontrés

- **`content-visibility: auto` sur `.poster-card` cassait la grille** (31/08/2026,
  signalé « pas adapté à la taille de l'écran ») : la containment de taille fait
  perdre au navigateur la largeur réelle des items → les colonnes `1fr` prenaient
  210 px, grille à 446 px dans un viewport de 360 (OPPO force 360 dp). Retiré.
  `html, body { overflow-x: hidden }` ajouté en garde-fou. Grille à 2 colonnes
  jusqu'à 400 px de large.

## Limites connues / à vérifier avec elle

- Le service worker n'a pas pu être testé dans l'environnement de build (l'aperçu
  intégré ne le supporte pas) — à confirmer en vrai sur `grainbote.github.io/season`
  (installation + coupure réseau).
- La clé TMDB est visible dans le dépôt public. Risque faible (clé gratuite,
  lecture seule, quota). Si un jour c'est gênant : passer par un petit proxy
  (Cloudflare Worker) — non fait en v1, choix assumé.
- Pas de calendrier des sorties à venir (écarté à la conception, v1).
