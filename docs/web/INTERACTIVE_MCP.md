# Réponses interactives et applications MCP

## Livraison

Cette étape prolonge le mode connecté local. Le propriétaire a confirmé le fonctionnement du chat FranceStudent sur son Mac. La démonstration statique continue à utiliser des données simulées et ne connecte aucun compte.

Le catalogue affiche dix intégrations : Google Drive, Gmail, Agenda Google, Outlook, OneDrive, Calendrier Microsoft, GitHub, Notion, Linear et Slack. Leur activation réelle dépend des applications OAuth configurées, des permissions des comptes et de la disponibilité des services externes. Aucune connexion de ChatGPT n’est transférée.

## Installation sur Mac

Depuis la branche `feat/interactive-responses-mcp` :

```sh
npm --prefix apps/server ci
npm --prefix apps/web ci
node scripts/start-local.mjs
```

Ouvrir http://127.0.0.1:3000 et utiliser le mot de passe local existant. Les préférences et anciens messages sont conservés. Pour voir un exemple hors connexion : démarrer le frontend sans le script connecté et envoyer « Aide-moi à préparer ma semaine » avec un modèle GPT simulé.

## Configuration administrateur initiale

Cette configuration se fait une fois, dans les consoles officielles et dans le Terminal. Arrêter le serveur local pendant la configuration ; le redémarrer ensuite. Les secrets saisis sont masqués et stockés dans le coffre AES-256-GCM. La clé est créée dans le Trousseau macOS, service « FranceStudent Web MCP ». Autoriser l’accès au Trousseau si macOS le demande. Ne jamais supprimer cette clé sans avoir révoqué puis reconfiguré les connexions.

Le parcours utilisateur reste : **Applications → Connecter → consentement officiel → retour automatique**. La fenêtre principale vérifie l’état de la connexion et ferme la fenêtre OAuth après réussite. Si elle a été bloquée, autoriser les fenêtres de connexion. Aucun jeton ni URL de serveur n’est saisi dans l’interface.

### Google : Drive, Gmail, Agenda

1. Créer un projet dans [Google Cloud](https://console.cloud.google.com/) et activer Google Drive API, Gmail API et Google Calendar API.
2. Configurer Google Auth Platform : nom de l’application, contact et écran de consentement. Choisir External pour couvrir les comptes personnels et Workspace ; ajouter ses comptes comme utilisateurs de test pendant le développement.
3. Créer un client OAuth de type **Web application** et enregistrer exactement :
   `http://localhost:4000/api/connectors/oauth/callback/google`
4. Déclarer les scopes utilisés :
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/calendar.events`
5. Enregistrer le Client ID et le Client Secret dans le Terminal :

```sh
npm --prefix apps/server run configure:apps -- google
```

Chaque application demande ses propres permissions au moment de Connecter ; elles sont également visibles dans sa fiche. L’état de test Google peut imposer une expiration des autorisations, notamment après sept jours. La publication à d’autres utilisateurs et les scopes restreints peuvent nécessiter une validation Google. Un administrateur Workspace peut aussi limiter le consentement.

### Microsoft : Outlook, OneDrive, Calendrier

1. Dans [Microsoft Entra](https://entra.microsoft.com/), créer une App registration.
2. Pour couvrir les deux types de comptes, choisir **Accounts in any organizational directory and personal Microsoft accounts**.
3. Ajouter une plateforme Web avec cette URI exacte :
   `http://localhost:4000/api/connectors/oauth/callback/microsoft`
4. Ajouter les permissions Microsoft Graph **delegated** : `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `Files.ReadWrite`, `Calendars.ReadWrite`, ainsi que `offline_access` pour le renouvellement.
5. Créer un secret client et enregistrer l’Application (client) ID et la **valeur du secret**, pas son identifiant :

```sh
npm --prefix apps/server run configure:apps -- microsoft
```

Le consentement effectif respecte les restrictions de l’organisation ; les comptes d’entreprise peuvent nécessiter un administrateur. Le serveur utilise l’autorité `common` pour accepter les comptes personnels et professionnels.

### GitHub

Créer une [OAuth App GitHub](https://github.com/settings/developers), callback :
`http://localhost:4000/api/connectors/oauth/callback/github`.
Configurer ses identifiants :

```sh
npm --prefix apps/server run configure:apps -- github
```

Le client utilise le [MCP GitHub officiel](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md). Les scopes initiaux sont `repo` et `read:user` ; les organisations peuvent restreindre l’accès à leurs dépôts. Le serveur distant ne propose pas l’enregistrement dynamique utilisé par certains autres services.

### Notion et Linear

Ces connecteurs utilisent l’enregistrement dynamique OAuth du MCP officiel. Aucune clé personnelle à copier dans l’interface. Cliquer sur Connecter et choisir les espaces autorisés. Les retours enregistrés automatiquement sont respectivement :

- `http://localhost:4000/api/connectors/oauth/callback/notion`
- `http://localhost:4000/api/connectors/oauth/callback/linear`

Si un service restreint l’enregistrement ou le retour local, la connexion affiche une erreur ; elle n’est jamais déclarée connectée artificiellement. Les identifiants d’un client OAuth préenregistré peuvent être configurés via `configure:apps -- notion` ou `-- linear` si nécessaire.

### Slack

Créer une Slack App pour le client MCP, déclarer les permissions utilisateur nécessaires aux outils souhaités et enregistrer :
`http://localhost:4000/api/connectors/oauth/callback/slack`.
Utiliser une application **interne** ou publiée dans le Slack Marketplace : Slack refuse les applications non répertoriées pour MCP. Suivre la [documentation officielle Slack MCP](https://docs.slack.dev/ai/slack-mcp-server/), y compris les restrictions d’installation et de distribution de l’espace.

```sh
npm --prefix apps/server run configure:apps -- slack
```

### Autres environnements

Pour les tests ou un système sans Trousseau macOS, fournir une clé serveur de 32 octets encodée en base64 dans `FS_VAULT_KEY`, via le gestionnaire de secrets de l’environnement. La conserver durablement hors du dépôt. Aucun repli sur un fichier de clé en clair n’est effectué.

Les variables serveur `FS_GOOGLE_CLIENT_ID`, `FS_GOOGLE_CLIENT_SECRET`, `FS_MICROSOFT_CLIENT_ID`, `FS_MICROSOFT_CLIENT_SECRET` et leurs variantes GITHUB/SLACK/NOTION/LINEAR peuvent remplacer la configuration chiffrée. Ne jamais utiliser le préfixe `NEXT_PUBLIC_` pour ces valeurs.

## Capacités concrètes

| Application          | Lecture automatique                                   | Écritures après confirmation                                  |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Google Drive         | Recherche, texte et export texte Google Docs          | Créer/modifier des fichiers texte ; mise à la corbeille       |
| Gmail                | Rechercher et lire les messages                       | Créer un brouillon ; envoyer un e-mail                        |
| Agenda Google        | Lire et lister les événements du calendrier principal | Créer, modifier, annuler                                      |
| Outlook              | Rechercher et lire les messages                       | Créer un brouillon ; envoyer un e-mail                        |
| OneDrive             | Recherche et lecture de fichiers texte                | Créer sans écraser un fichier existant ; modifier ; supprimer |
| Calendrier Microsoft | Lire et lister les événements                         | Créer, modifier, annuler                                      |
| MCP distants         | Outils de lecture explicitement reconnus              | Tous les autres outils sont soumis à confirmation             |

Les fichiers Office binaires ne sont pas édités. Le contenu natif Google Docs est lisible par export texte ; son édition nécessite une étape dédiée Google Docs API. Les recherches sont bornées et sans pagination interactive dans cette livraison. Aucun accès au disque local ni lancement de sous-processus MCP demandé par le modèle.

## Fonctionnement des réponses

Le catalogue conserve `modelProvider` et `model`. La famille OpenAI/Azure OpenAI avec modèles GPT, ChatGPT ou o-series reçoit automatiquement la consigne de présentation. Le nom affiché seul ne suffit pas. Les modèles sans métadonnées fiables ne reçoivent pas cette consigne. Un changement de modèle renouvelle le chat distant pour ne pas transmettre la politique GPT à une autre famille.

L’API FranceStudent utilise son DTO existant : aucune option `tools`, `response_format` ou API OpenAI directe n’est inventée. Les appels sont médiés par une grammaire textuelle contrôlée : blocs `fs-ui` pour la présentation et `fs-tool` pour une proposition d’appel. Le serveur valide les objets avant de les publier ou exécuter. Le respect de la grammaire reste une capacité du modèle ; une sortie invalide n’exécute rien et donne un remplacement textuel. Les familles de modèles reconnues peuvent utiliser le protocole d’outils ; un modèle inconnu reste en mode texte. Les variantes réelles doivent être vérifiées avec le catalogue du compte.

Le texte est transmis progressivement. Un composant n’apparaît qu’après validation complète. Les bibliothèques Recharts, Mermaid et KaTeX ne donnent au modèle aucun accès à JavaScript. Mermaid est strict, borné et filtré ; son SVG est assaini. Le Markdown ignore le HTML, interdit les liens non HTTPS et ne charge pas automatiquement les images distantes.

L’historique passe de la version 1 à la version 2 sous la même clé locale afin de préserver les données. Il inclut les composants, choix et coches manuelles. Une coche ne prouve jamais la réussite d’une opération externe. Les formulaires ajoutent une réponse utilisateur explicite au chat. Le navigateur reste la source de l’historique personnel ; PostgreSQL/Prisma reste l’architecture cible suivante.

## Contrôle des outils

Les adaptateurs Google/Microsoft sont de vrais serveurs MCP internes, reliés au client via le transport mémoire du SDK. Les connecteurs distants utilisent Streamable HTTP et OAuth. Leurs schémas sont chargés à la demande via describe_tools afin de borner la taille du catalogue envoyé au modèle. Les hôtes distants sont fixés par le catalogue ; le modèle ne choisit ni URL arbitraire ni destination d’un jeton. Les annotations d’un serveur distant ne suffisent pas à autoriser une écriture automatique : seuls les outils de lecture connus sont exécutés sans confirmation.

Une proposition d’écriture persistée contient l’utilisateur, le compte externe local, l’application, l’outil, les paramètres et la conversation. L’API d’approbation n’accepte que son identifiant et un booléen, jamais des paramètres de remplacement. L’appel est réservé avant exécution ; une double approbation ne le relance pas. Une reconnexion à un compte différent invalide les propositions antérieures. Un redémarrage pendant une exécution la marque comme incertaine.

Les résultats d’outils sont explicitement séparés des instructions. Les sources affichées proviennent d’URL réellement renvoyées par les services, pas d’une déclaration inventée par le modèle. Après chaque résultat, le même modèle FranceStudent peut poursuivre, dans la limite de cinq cycles par tour. Les données transmises à l’IA comprennent les résultats nécessaires des applications connectées ; connecter un compte autorise les lectures pertinentes pour la conversation.

## API locale

Toutes les routes, sauf le retour OAuth, exigent la session locale ; les mutations exigent l’origine locale autorisée.

- `GET /api/connectors` : catalogue et état, sans secret.
- `POST /api/connectors/:appId/connect` : démarrage OAuth.
- `GET /api/connectors/oauth/callback/:family` : état à usage unique lié à la session initiatrice, même sans cookie sur le retour externe.
- `POST /api/connectors/:appId/cancel` : annuler une connexion OAuth en attente.
- `POST /api/connectors/:appId/discover` : outils disponibles.
- `DELETE /api/connectors/:appId` : suppression locale et révocation Google lorsque possible. Microsoft et les MCP distants proposent aussi leur page de permissions pour une révocation chez le fournisseur.
- `GET /api/tool-operations?conversationId=…` : état réel des opérations du propriétaire.
- `POST /api/tool-operations/:id/decision` avec `{ "approved": true|false }` : décision sur l’appel exact.

Le SSE conserve `delta`, `done`, `error` et ajoute `block`, `source`, `tool`. Le client expose `streamEvents` ; le flux textuel historique reste compatible. Les interfaces CLI/TUI/Electron upstream ne sont pas modifiées.
