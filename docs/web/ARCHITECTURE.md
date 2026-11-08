# Architecture web

## V1 exécutée

Navigateur → composants React → état applicatif → contrat AIProvider → MockProvider.
La persistance des données et de l'apparence utilise deux clés localStorage versionnées. Les données existantes sont validées avant utilisation ; une sauvegarde illisible n'est pas écrasée sans réinitialisation explicite. Une sauvegarde dépassant le quota produit un avertissement et la session continue en mémoire.

- `apps/web` : frontière npm indépendante, App Router, TypeScript strict, Tailwind et CSS à variables, icônes Lucide.
- `packages/francestudent-client/src/contracts.ts` : types sans code réseau ni secret, importés uniquement avec `import type`.
- `MockProvider` : catalogue fictif tiré des modèles connus du dépôt audité, AsyncIterable de texte et AbortSignal. Il ne traite pas les instructions comme une IA réelle et n'analyse pas les documents.
- `apps/server` : réservé à la prochaine étape ; aucun faux backend de production.
- Export statique Next.js : aucune route API, aucune Server Action, aucune configuration fournisseur dans le navigateur. Sites applique sa protection d'accès propriétaire à l'aperçu privé.

## Données

Conversation : id, userId, titre, modèle, projet facultatif, favori, horodatage, messages.
Message : id, userId, rôle, contenu, état complete/streaming/stopped/error.
Projet : id, userId, nom, instructions. Document : id, userId, nom, texte, taille, projet facultatif.
Préférences : userId, thème, police et accent facultatif.

Le profil demo-local appartient au navigateur, pas à une session authentifiée. Les données ne sont pas chiffrées par l'application et disparaissent si le stockage du navigateur est effacé. Aucune synchronisation entre appareils. Documents affichés en texte brut ; fichiers binaires, HTML et exécution de contenu ne sont pas supportés.

## Architecture cible après validation de l'accès

Navigateur → API Node.js TypeScript → service de conversations / AIProvider → adaptateur FranceStudent serveur.
Le service persiste les données dans PostgreSQL via Prisma et renvoie un flux SSE interne au navigateur. Aucun en-tête ou objet d'authentification FranceStudent n'est renvoyé au client.

- Sessions privées opaques, cookies HttpOnly/Secure/SameSite et contrôle d'origine pour les mutations. Autorisation serveur de chaque ressource par userId, sans accepter un propriétaire fourni par le navigateur.
- Compte fournisseur rattaché à l'utilisateur ; secrets chiffrés côté serveur, JWT court en mémoire et renouvellement coalescé par compte.
- Transport et parser SSE testés par fixtures, identifiants de génération stables, distinction des réponses partielles, annulation locale et distante.
- AIProvider conserve catalogue, capacités, messages, contexte documentaire séparé, instructions du projet et génération annulable. Le contexte serveur reste explicite ; ne pas réutiliser les singletons auth/state de l'original.
- PostgreSQL : User, Session, ProviderAccount, Conversation, Message, Project, Document et AppearancePreference. Toutes les ressources privées sont possédées ou référencées par leur utilisateur.
- L'aperçu Sites statique reste une démonstration. Le backend Node.js/PostgreSQL nécessitera un hébergement approprié ; il n'est pas remplacé par Cloudflare D1 ou un Worker.

## Rendu et accessibilité

Deux thèmes via variables CSS ; script d'initialisation avant hydratation et suivi de prefers-color-scheme. Police appliquée à toute l'interface ; Times New Roman n'est pas redistribuée et peut utiliser une serif système de repli. Accents optionnels avec texte noir ou blanc choisi selon luminance ; focus neutralisé par contraste lisible.

Ordinateur : deux panneaux repliables et chat flexible. À moins de 901 px : chat seul au démarrage, tiroirs modaux, fermeture Échap et boucle de focus. De 901 à 1199 px, contexte fermé au démarrage. Les fenêtres modales rendent le reste de l'interface inerte. Respect du mouvement réduit, labels accessibles, états de génération annoncés sans annoncer chaque mot.
