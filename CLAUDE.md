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

- `index.html` — structure, barre du haut (⏰ À venir + ⚙ Réglages), 7 onglets
  (Séries, Films, Recherche, **Favoris**, **Journal**, **Listes**, Stats)
- `app.css` — thème sombre, mobile d'abord (max 560 px, safe-area iOS/Android) ; accent **orange** `#ff8a3d` (texte `--on-accent` foncé dessus), `--warn` rouge — depuis le 18/09/2026 (avant : bleu-violet). L'icône de l'appli est passée à l'orange elle aussi le 21/09/2026 (`outils/creer-icones.ps1`, `$accent` = `#ff8a3d` ; relancer le script regrave les 3 PNG de `icons/`)
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
  calculée en parcourant tous les épisodes), *Titre A→Z*, **Popularité**
  (depuis le 20/09/2026). *Ajout récent* (`createdAt`) a été **retiré le
  21/09/2026** : elle le prenait pour « vu récemment » et s'étonnait de l'ordre.
  Un choix enregistré qui n'existe plus retombe sur le tri par défaut
  (`sortOr`) — sinon le menu affichait un tri, l'appli en appliquait un autre. Même menu sur Favoris
  (`season.favSort`) — un seul `sortBar` / `sortersFor` partagé.
- **Popularité** = `show.popularity` (TMDB), enregistrée depuis le 20/09/2026 par
  `TMDB.tv/movie` (donc mise à jour à chaque rafraîchissement de fiche). Les fiches
  plus anciennes ne l'ont pas : elles se rangent **en dernier**, et une barre sous le
  tri propose « ↻ Récupérer » (`popularityBar` → `TMDB.popularityOf`, paquets de 12,
  compteur). L'écriture passe par `DB.putShowQuiet` pour **ne pas toucher
  `updatedAt`** (sinon le tri « Vu récemment » serait chamboulé). `show.lastWatchedAt` est tenu à jour par `recomputeAndSave` mais
  le tri « vu récemment » recalcule depuis `DB.allEpisodes()` pour couvrir les
  données importées.
- **« Sur mes plateformes seulement »** (depuis le 20/09/2026) : pastille affichée
  **uniquement dans « À voir »** et seulement si des plateformes sont choisies
  (`localStorage` `season.onlyMine`). La disponibilité est **gardée sur la fiche**
  (`show.avail` = toutes les plateformes où le titre passe, `show.availAt` = date du
  relevé, revérifié au bout d'**une semaine**, `AVAIL_TTL`) : ce qui est déjà relevé
  s'affiche tout de suite, le reste se vérifie à la demande (« ↻ Vérifier », une
  requête par titre, paquets de 12, `fillAvailability` + `DB.putShowQuiet` pour ne pas
  toucher `updatedAt`). Changer de plateformes ne redemande rien (on refiltre `avail`).
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
- **Présentation façon Letterboxd** (depuis le 20/09/2026, sur sa capture d'écran) :
  **bannière** en haut (`show.backdrop`, `TMDB.backdrop`, pleine largeur via des marges
  négatives, dégradé vers le fond), **affiche posée dessus à droite** (flottante, le
  texte l'habille), **gros titre**, `Film|Série · année · RÉALISÉ PAR / CRÉÉE PAR` +
  nom, ligne **▶ Bande-annonce** (lien YouTube) + durée, pastilles de thèmes,
  **accroche** (`tagline`, en capitales) et résumé.
- **♥ et ≡ (listes)** : depuis le 21/09/2026 ce sont deux **icônes seules**, posées
  **sur la ligne de la bande-annonce, à droite de la durée** (`.fav-btn.is-icon`
  dans `.hero-line` ; avant : deux boutons à libellé sur une rangée à part). Le
  libellé survit en `aria-label` + `title` (lecteur d'écran, appui long) et suit
  l'état (« Favori » / « Ajouter aux favoris »). `⊘ Pas intéressé`, lui, **garde
  son libellé écrit** sur sa rangée (`.detail-actions`), qui n'est insérée que si
  elle contient quelque chose — donc jamais sur une fiche suivie.
- Champs TMDB ajoutés le 20/09/2026 : `backdrop`, `tagline`, `director` (films :
  `credits` job *Director* ; séries : `created_by`), `trailer` (clé YouTube,
  `append_to_response=…,videos`, `include_video_language=fr,en`). Une fiche
  enregistrée avant (`show.backdrop === undefined`) est **complétée en tâche de fond**
  à l'ouverture, comme les mots-clés, puis redessinée sur place.
- **Affiche en grand** : un tap sur l'affiche ouvre une superposition plein écran
  (`openPoster`, image en `w780`) ; un tap, la croix, ou le bouton retour d'Android la
  referment sans quitter la fiche (`closeOverlay` appelé par `popstate`, `go` et `back`).
- **Ma note** : 5 étoiles à demi-pas (moitié gauche = x,5 ; moitié droite = x ;
  retaper la note actuelle la remet à 0). Depuis le 21/09/2026 elles sont
  **grossies (44 px) et centrées**, et la valeur chiffrée « x / 5 » qui les
  suivait a été **retirée** (même jour) : les étoiles se lisent seules. Le
  demi-pas se calcule sur `getBoundingClientRect`, donc la taille n'a rien
  cassé (revérifié).
- **« Où regarder »** : plateformes TMDB `/watch/providers` (région FR ; pas de
  location/achat, demandé le 18/09/2026). Refondu le 21/09/2026 :
  **une seule rangée**, sans les en-têtes « Abonnement » / « Gratuit » (les deux
  sont fondus par un seul `pick(r.flatrate, r.free, r.ads)`), **ses plateformes
  en tête** (`pick` trie sur `isMine`, le reste garde l'ordre TMDB), et
  **logos seuls en grand** (tuiles de 48 px, `TMDB.logo(p.logo, "w154")` pour
  rester net sur un écran 3x) : plus de nom écrit à côté. Le nom reste dans
  l'`alt` (lecteur d'écran) et le `title` (appui long) ; une plateforme sans
  logo chez TMDB retombe sur une pastille à son nom (`.wtw-noimg`).
  **Tout tient sur une ligne** : 6 cases de 48 px + 5 écarts de 8 = 328 px pour
  332 px utiles sur son écran de 360 (mesuré sur l'Oppo, pas déduit). Le « +N »
  occupe une case, donc dès qu'il apparaît on ne montre que **5** logos
  (`shown = list.length > MAX ? MAX - 1 : list.length`).
  `.wtw-chip` est en `flex: 0 0 auto` : des tuiles d'image n'ont pas de largeur
  minimale de contenu, sans ça elles se tasseraient au lieu de passer à la ligne.
  **Un tap sur un logo ouvre le catalogue de la plateforme** (`renderPlateforme`,
  21/09/2026) : les tuiles sont donc des `<button>`.
  Le lien « Source : JustWatch ↗ » a été **retiré de la fiche le 21/09/2026** et
  **déplacé dans Réglages → Sources** (son choix) : ces données viennent de
  JustWatch via TMDB, et les conditions de TMDB demandent de citer JustWatch
  quand on les affiche. L'attribution TMDB y est aussi. Ne pas la supprimer sans
  lui en reparler — le dépôt est public.
- **« Mon avis » retiré de la fiche le 21/09/2026** (sa demande). Le champ
  `show.review` n'est plus affiché ni modifiable, mais il **reste en base et dans
  l'export** : il porte les critiques importées de Letterboxd et les marques
  « ★ Favori sur TV Time » / « ♥ Aimé sur Letterboxd » dont `seedFavorites`
  se sert. Ne pas le purger sans le lui demander.
- **Thèmes = pastilles cliquables** (`.genre-tag`) → page thème (voir Thèmes).
- **Suggestions façon Letterboxd** (depuis le 20/09/2026) : sections « Séries
  similaires » / « Films similaires » (avant : « Dans le même genre · … »), titre de
  section avec **« Tout voir »** à droite (`.section-head`) et rangée d'**affiches
  seules** qui défile (`.reco-row.no-caption` ; le titre reste en `aria-label`).
  « Tout voir » ouvre `renderSimilaires` : la même liste en grille.

### Page d'une plateforme (depuis le 21/09/2026)

- Ouverte en tapant un logo de « Où regarder » (`renderPlateforme(fromType, prov)`,
  posée sur la pile de vues, titre = le nom de la plateforme).
- En-tête logo + nom (pas de phrase explicative sous les onglets : retirée le
  21/09/2026), segmented **Séries / Films** (choix retenu par plateforme le
  temps de la session, `provTab`), tri partagé avec les pages de thème
  (`THEME_SORTS` : Populaires / Mieux notés / Plus récents / Plus anciens, retenu
  dans `localStorage season.provSort`), puis la grille d'affiches.
- **Défilement infini** (21/09/2026, à la place du bouton « Voir plus ») : une
  sentinelle `.load-more` en bas de grille, suivie par un `IntersectionObserver`
  (`rootMargin: 400px`), charge la page suivante — elle sert aussi de rond de
  chargement. Deux garde-fous : l'observateur ne redit rien tant que la sentinelle
  reste visible, donc après chaque chargement on revient la tester soi-même
  (`proche()`), mais au plus **4 enchaînements** d'affilée (le quota repart à zéro
  dès qu'elle défile vraiment) ; et une erreur réseau pose `st.total = st.page`
  pour ne pas boucler dessus. L'observateur est coupé en changeant d'onglet
  Séries/Films et en quittant l'écran. Les pages de thème, elles, gardent leur
  bouton « Voir plus ».
- **Abonnement et gratuit seulement, jamais la location ni l'achat VOD** (sa
  demande) : `TMDB.discoverPage(type, {}, { prov: [id] })` envoie
  `with_watch_providers=<id>`, `watch_region=FR` et
  `with_watch_monetization_types=flatrate|free|ads` — vérifié sur la requête réelle.
- « Pas intéressé » reste filtré ; en revanche **ce qu'elle a déjà vu n'est pas
  masqué** (contrairement aux pages de thème) : c'est un catalogue, pas une liste
  de suggestions.
- Pages gardées en cache le temps de la session (`provCache`, clé
  `type|idPlateforme|tri`) : revenir dessus ne recharge rien.

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
- **Tri de la page d'un thème** (depuis le 20/09/2026, `THEME_SORTS`, retenu dans
  `localStorage` `season.themeSort`) : *Populaires* (défaut), *Mieux notés*, *Plus
  récents*, *Plus anciens*. Le tri est demandé à TMDB (`sort_by`) **et** rejoué côté
  appli (`THEME_CMP`) pour fusionner les critères d'une même page. *Mieux notés* relève
  le minimum de votes à 300 (sinon des inconnus notés 10/10 remontent) ; les tris par
  date excluent ce qui n'est pas encore sorti (`<date>.lte = aujourd'hui`). Le tri fait
  partie de la clé du cache `themeCache`.
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
- 7 onglets ne tiennent pas sur 360 px : `#tabbar` déborde (`overflow-x`, onglets
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

### « Pas intéressé » (depuis le 20/09/2026)
- Marque un titre pour qu'il ne soit **plus proposé** : suggestions de fiche
  (« Séries / Films similaires », et la liste est passée à TMDB en `skip` pour qu'il
  propose autre chose) et **pages de thème**. Ses propres titres suivis ne sont
  jamais filtrés (ils ne sont de toute façon pas proposés).
- Deux façons de le faire : **appui long** (~550 ms, petite vibration) sur une
  vignette de suggestion — elle disparaît aussitôt, le tap normal ouvre toujours la
  fiche (`armLongPress`, le clic qui suit l'appui long est avalé) — ou le bouton
  **⊘ Pas intéressé** d'une fiche **pas encore suivie** (re-touche = réafficher).
- Stocké dans `localStorage` `season.hidden` = `[{key,title,poster}]` (`hiddenKeys`,
  `isHidden`, `setHidden`), **repris dans l'export** (`settings.hidden`).
- **Réglages → « Pas intéressé (N) »** : la liste des titres masqués en pastilles,
  un tap sur l'une d'elles la réaffiche.

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

### À venir — page de l'onglet Séries (depuis le 21/09/2026)
- Ce n'était plus un onglet depuis le 21/09/2026 (son choix) : l'écran s'ouvre
  par le bouton **⏰ de la barre du haut, à gauche de l'écrou** (`#avenirBtn`),
  et se pose sur la pile de vues de Séries (`go`, flèche de retour) au lieu de
  `resetTo`. Le bouton n'apparaît **que sur l'écran Séries lui-même**
  (`syncAvenirBtn` : `currentTab === "listes"` et pile à 1), il disparaît donc
  sur une fiche, les réglages et les autres onglets.
- L'horloge est l'émoji ⏰ suivi de **U+FE0E** (sélecteur de version *texte*) :
  sans lui, l'émoji couleur ignore `color` et sort rose/rouge ; avec lui, le
  glyphe monochrome prend l'orange de l'accent (`#avenirBtn`, plus
  `font-variant-emoji: text`).
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

## Vertical seulement (depuis le 21/09/2026)

- **Raccourci installé** : rien à faire, `manifest.webmanifest` a déjà
  `"orientation": "portrait"` → Chromium met `screenOrientation="sensorPortrait"`
  sur les activités du WebAPK (vérifié à l'`aapt2` sur l'APK installée le
  21/09/2026). Le raccourci **ne peut pas** basculer en paysage.
- **Site ouvert dans un onglet de navigateur** : le manifeste ne s'applique pas.
  `#rotate` (index.html + fin d'`app.css`) couvre alors l'appli d'un écran
  « Remets ton téléphone droit ». La media query est volontairement étroite —
  `(orientation: landscape) and (max-height: 500px) and (pointer: coarse)` —
  pour ne jamais se déclencher sur un ordinateur (moniteur = plus haut que
  500 px et souris). `#topbar/#tabbar/#view` passent en `visibility: hidden`
  (pas `display: none`) : rien n'est redéssiné quand elle remet le téléphone droit.
- `screen.orientation.lock("portrait")` est tenté au démarrage (fin d'`app.js`)
  pour le plein écran ; dans un onglet ordinaire il est refusé, d'où le CSS.

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
  `runtime` (film), `watchedMovie`, `favorite`, `popularity`, `backdrop`, `tagline`,
  `director`, `trailer`, `avail`/`availAt` (plateformes relevées), `createdAt`,
  `updatedAt`, `metaAt`, `epAt`.
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
