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

## État actuel : connexion personnelle sur Mac

Le serveur local et l'adaptateur réel sont implémentés ; la section PostgreSQL ci-dessus décrit toujours la cible suivante. Le propriétaire a demandé de valider en priorité le chat réel. Next.js possède un mode connecté activé par NEXT_PUBLIC_FS_CONNECTED=true : il relaie /api vers le serveur local 4000. Le script start-local.mjs active ce mode et limite les deux services à 127.0.0.1. Le mode export statique reste la valeur par défaut.

Le serveur dérive userId de sa session opaque et ignore tout propriétaire ou chat distant proposé par le navigateur. Il dispose d'un seul propriétaire configuré dans un dossier privé OS ; la connexion FranceStudent est réalisée dans un processus Terminal séparé qui réutilise le login source. JWT et renouvellement sont propres à l'instance d'adaptateur, sans importer les singletons source dans le processus HTTP. Aucun secret n'apparaît dans les types partagés, les événements SSE internes ou les réponses HTTP.

Le parser SSE reconnaît UTF-8 fragmenté, LF/CRLF, commentaires et données multilignes. L'événement completed du backend est obligatoire ; response.completed seul ne vaut pas confirmation de fin. 401 est relancé une fois avant flux, 429/409 et erreurs après début ne sont pas rejoués silencieusement. Une génération locale possède un requestId, une association à son propriétaire et une annulation. Les doublons de requestId sont refusés. La perte de connexion déclenche l'arrêt local et une tentative d'annulation distante.

L'état courant de cette étape est documenté sans assimilation à un déploiement multi-utilisateur : voir LOCAL_CONNECTION.md.
