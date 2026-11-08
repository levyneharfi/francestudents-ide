# Serveur local FranceStudent Web

Serveur Node.js / TypeScript pour la connexion réelle : session web locale, catalogue FranceStudent, proxy SSE, annulation et association des conversations au propriétaire. Écoute sur 127.0.0.1:4000 uniquement.

Installation : `npm ci`. Configuration : `npm run setup`. Vérification réelle : `npm run check`, puis `npm run check -- --chat`. Tests hors ligne : `npm run typecheck` et `npm test`.

Lire [le guide Mac](../../docs/web/LOCAL_CONNECTION.md). Les secrets FranceStudent ne traversent jamais la frontière navigateur. Aucun PostgreSQL ni partage multi-utilisateur à cette étape : l'historique reste local et la migration Prisma est prévue ensuite.
