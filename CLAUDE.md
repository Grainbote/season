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

- `index.html` — structure, barre du haut (⚙ Réglages), 5 onglets (Séries, À venir, Films, Recherche, Stats)
- `app.css` — thème sombre, mobile d'abord (max 560 px, safe-area iOS/Android)
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
  *Titre A→Z*. `show.lastWatchedAt` est tenu à jour par `recomputeAndSave` mais
  le tri « vu récemment » recalcule depuis `DB.allEpisodes()` pour couvrir les
  données importées.
- Grille d'affiches ; pour les séries, barre de progression + `x/y épisodes`.
- Le **statut d'une série est déduit** de la progression : 0 épisode = À voir,
  au moins 1 = En cours, tous = Vu. Le passage est automatique.

### Onglet Recherche
- Recherche TMDB `search/multi` (séries + films), triée par popularité, en français.
- Résultat → fiche. Plus de bouton « Ajouter à mes listes » (retiré le 18/09/2026) :
  une fiche **pas encore suivie** montre directement **À voir / Vu** ; un tap ajoute le
  titre avec ce statut (`addWithStatus` : récupère les épisodes d'une série, « Vu » sur
  une série coche tous ses épisodes, sans confirmation puisqu'elle vient de choisir).

### Fiche
- Affiche, année, genres, résumé.
- **Statut** :
  - Film : boutons *À voir* / *Vu*.
  - Série : *À voir* et *Vu* cochent / décochent toute la série (confirmation) ;
    *En cours* est un simple témoin (non cliquable).
- **Note** : 0 à 5 étoiles **par demi-étoiles** (moitié gauche d'une étoile = x,5, moitié droite = x ; retaper la note actuelle remet à 0 ; valeur « 3,5 / 5 » affichée à côté). `show.rating` peut donc valoir 0,5, 1, 1,5… 5.
- **Avis** : zone de texte, enregistrement automatique (600 ms après la frappe + au blur).
- **Épisodes** (séries) : accordéon par saison, case à cocher par épisode,
  compteur et mini-barre de saison mis à jour **en direct**, bouton
  *Tout cocher / décocher la saison*.
- **Retirer de mes listes** (destructif, confirmation) — efface la série et ses épisodes.
- **Où regarder** (sous le résumé, aussi sur une fiche pas encore ajoutée ; masqué
  hors-ligne) : `TMDB.whereToWatch` → `/{type}/{id}/watch/providers`, région FR
  (données JustWatch, lien « Source : JustWatch »). 2 lignes : *Abonnement*
  (flatrate), *Gratuit* (free + ads) — **pas de location/achat** (elle ne loue pas,
  retiré à sa demande le 18/09/2026) ; une plateforme
  n'apparaît qu'une fois (1ʳᵉ ligne gagnante). Variantes fondues dans la principale
  (« Netflix Standard with Ads » → Netflix, par préfixe de nom). **Ses plateformes**
  (Réglages) en premier, entourées en bleu. 5 max par ligne puis bouton « +N ».
  Rien → « Pas disponible en abonnement ni gratuitement en France pour l'instant ».
- **Dans le même genre** (bas de fiche, aussi sur une fiche pas encore ajoutée ;
  masqué hors-ligne) : deux rangées d'affiches défilant à l'horizontale, tap → fiche.
  `TMDB.related(type, id)` = 1 appel `/{type}/{id}?append_to_response=recommendations,similar`
  + 5 pages `/discover/{autre type}`.
  - Rangée 1, **même type** : recommandations TMDB puis titres « similaires » en complément.
  - Rangée 2, **l'autre type** (films pour une série, séries pour un film) : genres
    traduits via `GENRE_BRIDGE` (les ids diffèrent entre séries et films ; téléréalité,
    horreur… sans équivalent → ignorés), *Drame* ignoré s'il y a d'autres genres,
    pas d'animation/jeunesse si le titre de départ n'en est pas ; classé par nombre
    de genres en commun (jusqu'à 3, abaissé si < 8 résultats) puis popularité.
    Forcément plus approximatif que la rangée 1.
  - **Filtre** : titres **Vu** ou **En cours** masqués ; ceux **À voir** restent avec
    un badge « À voir ». 15 max par rangée. Résultat TMDB mis en cache en mémoire
    (`relatedCache`, clé = fiche + plateformes choisies) le temps de la session.
  - **Plateformes** (si choisies dans Réglages) : seuls les titres dispo en
    **abonnement, gratuit ou avec pub** (`flatrate|free|ads`, pas location/achat) sur
    une de ses plateformes, en France (`REGION`, `config.js` peut le surcharger).
    Rangée 1 : chaque recommandation est vérifiée via `/{type}/{id}/watch/providers`
    (40 max, par lots de 8), complétée par un `/discover` du même type filtré par
    plateformes si < 10. Rangée 2 : `/discover` avec `with_watch_providers`, puis
    vérif pour le logo. Logo de la plateforme en bas à droite de chaque affiche.
    ~4-5 s de chargement (spinner). Lien « Choisir / Modifier mes plateformes » sous
    les rangées.

### Réglages (bouton ⚙ en haut à droite)
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

## Bouton retour d'Android

Géré dans `app.js` (`armBackTrap`, `popstate`) : une entrée d'historique « piège »
(`{seasonTrap:true}`) au-dessus de la racine ; chaque retour système la consomme →
fiche/réglages : écran précédent ; autre onglet : Séries ; Séries : toast
« Appuie encore pour quitter » (2,2 s), 2ᵉ appui = sortie. Le piège est remis après
chaque retour géré. Avant (jusqu'au 18/09/2026), retour fermait l'appli.

## Modèle de données (IndexedDB `season`)

- `shows`, clé `key` = `tv:<tmdbId>` ou `movie:<tmdbId>` : `type`, `title`, `year`,
  `poster`, `overview`, `genres[]`, `status`, `rating`, `review`, `seasons[]`
  (`{number,name,count}`), `totalEpisodes`, `watchedEpisodes`, `epRunTime`,
  `runtime` (film), `watchedMovie`, `createdAt`, `updatedAt`, `metaAt`, `epAt`.
- `episodes`, clé `key` = `tv:<id>:<saison>:<épisode>`, index `byShow` :
  `showKey`, `season`, `episode`, `name`, `runtime`, `airDate`, `still`,
  `watched`, `watchedAt`.

## Rafraîchissement TMDB

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
