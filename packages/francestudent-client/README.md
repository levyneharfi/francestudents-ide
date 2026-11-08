# Contrat fournisseur

`src/contracts.ts` contient uniquement les contrats publics. Aucun secret ni appel réseau.
`src/server.ts` est l'adaptateur réel Node.js : authentification par session, renouvellement du JWT, modèles et chat SSE. Il ne doit jamais être importé par le frontend. `src/sse.ts` est un décodeur de cadrage SSE sans secret, partagé avec le navigateur. Le catalogue de AIProvider peut maintenant être asynchrone.
Ne pas importer les singletons `src/api/auth.js` ou `src/state.js` dans un serveur partagé.
