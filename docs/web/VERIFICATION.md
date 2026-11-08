# Vérification de la V1 — 8 novembre 2026

## Résultats

- Installation npm du frontend indépendant : réussie. Lockfile propre à apps/web, version Next.js résolue 16.4.5.
- TypeScript strict : réussi. Les vérifications des déclarations de dépendances suivent la configuration Next.js standard (`skipLibCheck`) ; le code applicatif reste strict.
- Six tests unitaires : réussis. Préférences invalides, propriétaires, stockage malformé, restauration d'un flux partiel, import texte et limites, annulation et échec/reprise du fournisseur simulé.
- Onze tests Chromium : réussis. Conversations, streaming, arrêt/reprise, modèle, renommage/suppression, favoris, recherche, persistance, projets et instructions, document brut non exécutable, refus PDF, apparence persistante et automatique, tiroirs mobiles et limites du focus, sauvegarde illisible non écrasée.
- Six configurations visuelles : 390 / 768 / 1440 px × sombre / clair. Vérification de la saisie visible et de l'absence de débordement horizontal. Captures du chat et de l'apparence dans `artifacts/web/`.
- Inspection visuelle des captures : composition conforme au concept approuvé, panneaux séparés, chat central, interface monochrome sans accent par défaut. Les réglages sont défilables sur les petites hauteurs.
- Export statique Next.js : réussi. Sorties `apps/web/out` et `out`.
- Réseau du parcours chat contrôlé : uniquement des ressources du serveur statique local ; aucune requête vers FranceStudent ou un service IA.
- 43 tests ciblés de l'original : réussis (`core-chat`, `core-session`, `api-files`, `api-retry`, `login`, `state-conversations`). Ils utilisent leurs simulations, pas un compte FranceStudent réel.

## Limites explicites

- La suite complète Electron / TUI et la construction des installateurs natifs n'ont pas été exécutées. Leurs sources et scripts sont conservés.
- Pas de serveur de production, PostgreSQL, Prisma, authentification FranceStudent, SSE réseau, recherche web ou analyse documentaire réels. Ces éléments appartiennent aux étapes suivantes.
- Le profil demo-local n'est pas une session sécurisée. L'accès à l'aperçu est protégé par Sites ; les données de la démonstration restent propres au stockage du navigateur.
- Pas de validation physique sur téléphone ni de test de tous les navigateurs ; contrôle responsive automatisé sous Chromium.
- Le fork GitHub distant n'a pas pu être créé : la commande dédiée a renvoyé Forbidden avec la connexion de cet environnement. Historique préservé et procédure de reprise documentée.

## Reproduction

```sh
npm --prefix apps/web ci
npm --prefix apps/web run typecheck
npm --prefix apps/web test
npm --prefix apps/web run build
npm --prefix apps/web run test:e2e
node --test test/core-chat.test.js test/core-session.test.js test/api-files.test.js test/api-retry.test.js test/login.test.js test/state-conversations.test.js
```

Les tests navigateur lancent automatiquement un serveur statique et l'arrêtent après exécution. Pour une installation Chromium différente, définir PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
