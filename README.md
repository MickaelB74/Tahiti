# 🌺 Tahiti & Moorea — Travel Planner

Planificateur de voyage interactif pour Tahiti et Moorea (Polynésie française).

## Fonctionnalités

- **Carte interactive** — Leaflet + CARTO, centrée sur Tahiti & Moorea avec marqueurs GPS
- **Recherche** — API Nominatim (OpenStreetMap) pour trouver plages, restaurants, randonnées…
- **Liste de voyage** — Ajoutez des lieux par catégorie, cochez-les une fois visités
- **Fiche détail** — Coordonnées GPS, lien Google Maps, gestion visité/supprimé
- **Persistance** — localStorage, les données survivent au rechargement

## Structure

```
tahiti-planner/
├── server.js          # Serveur Express
├── package.json
├── render.yaml        # Config déploiement Render
├── README.md
└── public/
    ├── index.html     # HTML
    ├── style.css      # CSS
    └── app.js         # JavaScript
```

## Lancer en local

```bash
npm install
npm start
```

Ouvrir http://localhost:3000

## Déployer sur Render

1. Pusher le projet sur un repo GitHub
2. Sur [render.com](https://render.com) → **New** → **Web Service**
3. Connecter le repo GitHub
4. Render détecte automatiquement le `render.yaml`, sinon :
   - **Build command** : `npm install`
   - **Start command** : `npm start`
5. Cliquer **Deploy**

Le site sera live en quelques secondes.
