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

- `index.html` — structure, barre du haut, 3 onglets, barre du bas
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

### Onglet Listes
- Segmented **À voir / En cours / Vu** avec compteurs.
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
- Résultat → fiche. Bouton **Ajouter à mes listes** (récupère alors tous les
  épisodes de la série depuis TMDB).

### Fiche
- Affiche, année, genres, résumé.
- **Statut** :
  - Film : boutons *À voir* / *Vu*.
  - Série : *À voir* et *Vu* cochent / décochent toute la série (confirmation) ;
    *En cours* est un simple témoin (non cliquable).
- **Note** : 0 à 5 étoiles (recliquer la même étoile remet à 0).
- **Avis** : zone de texte, enregistrement automatique (600 ms après la frappe + au blur).
- **Épisodes** (séries) : accordéon par saison, case à cocher par épisode,
  compteur et mini-barre de saison mis à jour **en direct**, bouton
  *Tout cocher / décocher la saison*.
- **Retirer de mes listes** (destructif, confirmation) — efface la série et ses épisodes.

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
