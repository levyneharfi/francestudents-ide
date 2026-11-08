# Validation de la connexion locale

## Contrat et implémentation

Contrat fourni par le propriétaire : OpenAPI 3.1.0, info.version v0, SHA-256 `1d2228353c151e0bf8ef53e997b7ffaaad24172af62b68c92180b08d8fa67ae1`. Le fichier est conservé sans exécuter son contenu.

Endpoints couverts : GET `/user/me`, GET `/chats/agents`, POST `/chats/stream`, POST `/chats/{chatId}`, PATCH `/chats/{chatId}` avec isPrivate, POST `/chats/{chatId}/stream/cancel`. Le cadrage SSE vient du contrat fourni et de la logique du client original. L'échange cookie → JWT relève de l'implémentation existante dans src/api, pas d'un endpoint de connexion inventé à partir de Swagger.

Le champ servers du contrat indique HTTP ; le runtime ne l'utilise pas et conserve HTTPS sur les domaines FranceStudent fixes. Il ne reçoit aucune URL de fournisseur depuis le navigateur.

## Vérifications effectuées

- Vérification TypeScript du serveur et du frontend.
- 12 tests serveur/contrat : auth concurrente et renouvellement, cookie tournant, 401, 429 sans replay, catalogue actif, création/continuation, passage en privé, SSE UTF-8/CRLF et multiline, fin confirmée, erreur dans HTTP 200, annulation distante, timeout avant réponse réelle ; session locale, origine, propriétaire, déconnexion et doublons de génération.
- Six tests unitaires frontend existants ; 11 parcours Chromium de démonstration préservés, avec les deux thèmes à 390, 768 et 1440 pixels.
- Un parcours Chromium connecté de bout en bout avec serveur HTTP de protocole local : connexion par session locale, modèles obtenus du backend, lecture SSE progressive, arrêt, nouvelle tentative, continuation, rechargement de l'historique, apparence et déconnexion. Capture ordinateur et mobile dans les deux thèmes.
- Aucun appel du navigateur aux domaines FranceStudent, aucune valeur de cookie ou de JWT fournisseur dans son localStorage ni dans l'export statique contrôlé.
- 43 tests ciblés de l'application d'origine réussis. Aucun changement dans src/, desktop/, bin/ ou les scripts du package racine.
- Construction statique de démonstration conservée ; mode Next.js connecté séparé.

Ces tests utilisent des sentinelles et un serveur HTTP local conforme au contrat ; les captures du mode connecté affichent un modèle de test. Ils ne constituent pas une preuve d'authentification sur un compte FranceStudent réel.

## Validation réelle restante

L'environnement cloud refuse les connexions sortantes au domaine FranceStudent (403 CONNECT du proxy) et ne contient aucun secret du propriétaire. Aucun compte n'a donc été connecté ni aucun message réel envoyé depuis cet environnement.

Sur Mac, lancer setup puis `npm --prefix apps/server run check -- --chat` selon LOCAL_CONNECTION.md. Le premier test authentifié doit confirmer profil, catalogue, réponse et fin du flux. Si un quota, une protection d'authentification ou une différence de contrat intervient, conserver uniquement le code/message sans secret pour diagnostic. Aucun succès réel n'est revendiqué avant ce résultat.

## Limites

Usage personnel local uniquement. Un propriétaire, fichiers de session avec permissions OS, historique navigateur. PostgreSQL/Prisma, synchronisation distante, multi-utilisateur, imports binaires et déploiement du backend ne sont pas inclus dans cette étape de connexion prioritaire.
