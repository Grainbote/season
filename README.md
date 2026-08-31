# Season

Suivi perso des séries et films que je regarde, façon TV Time.
Appli web installable (PWA), thème sombre, mobile d'abord.
**Mes données restent dans mon téléphone** — rien n'est envoyé sur un serveur.

👉 **[grainbote.github.io/season](https://grainbote.github.io/season/)**

## Installer sur le téléphone

1. Ouvrir l'adresse ci-dessus dans le navigateur du téléphone.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. L'icône Season apparaît ; l'appli fonctionne ensuite même sans réseau.

## Mettre sa clé TMDB

La recherche a besoin d'une clé gratuite de [themoviedb.org](https://www.themoviedb.org/)
(compte gratuit → Paramètres → API → clé « v3 auth »). La coller dans
[`config.js`](config.js), puis `git push`.

## Aperçu sur l'ordi

```
node server.js
```
puis ouvrir `http://localhost:3007`.

## Sauvegarde

Onglet **Stats → Sauvegarde** : exporter un fichier `.json`, et le réimporter
sur un autre téléphone ou après avoir vidé le navigateur.
