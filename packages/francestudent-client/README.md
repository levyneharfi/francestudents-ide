# Contrat fournisseur

`src/contracts.ts` contient uniquement les contrats publics. Aucun secret ni appel réseau.
Le futur adaptateur FranceStudent sera un point d'entrée serveur distinct, non importable par le frontend.
Ne pas importer les singletons `src/api/auth.js` ou `src/state.js` dans un serveur partagé.
