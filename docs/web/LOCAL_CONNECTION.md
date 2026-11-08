# Connexion réelle à FranceStudent — guide Mac

Cette version connecte le chat à votre compte FranceStudent depuis un serveur **local** sur votre Mac. Le site Sites existant reste une démonstration séparée. Aucun secret FranceStudent ne doit être ajouté à GitHub ou communiqué dans cette conversation.

## 1. Récupérer la branche et installer

Dans le Terminal, depuis votre dossier `francestudent-web` déjà cloné :

```sh
git fetch origin
git switch --track origin/feat/francestudent-live-local
node --version
npm --prefix apps/server ci
npm --prefix apps/web ci
```

Node.js **22 ou 24** est requis. Si la branche locale existe déjà, utiliser `git switch feat/francestudent-live-local`, puis `git pull --ff-only` à sa place. Ne pas supprimer de fichiers ni réinitialiser votre travail en cas d'erreur : conserver le message pour diagnostic.

## 2. Configurer les deux connexions

```sh
npm --prefix apps/server run setup
```

La commande demande successivement :

1. Un **nouveau mot de passe local** de 12 caractères minimum, puis sa confirmation. Il sert uniquement à ouvrir votre interface web locale ; choisissez-en un distinct de FranceStudent.
2. Votre e-mail FranceStudent dans le Terminal.
3. Votre mot de passe FranceStudent, en saisie masquée.

Le parcours de connexion réutilise `src/api/login.js` et `src/api/auth.js` de l'application d'origine, uniquement dans ce processus interactif. Il vérifie ensuite le profil et le catalogue de modèles. Le mot de passe FranceStudent n'est pas sauvegardé ; le cookie de session est conservé côté serveur dans votre dossier privé utilisateur.

### Si FranceStudent impose CAPTCHA, MFA ou bloque la connexion automatique

La commande s'arrête ; elle ne tente pas de contourner cette vérification. Connectez-vous normalement à [FranceStudent IA](https://ia.francestudent.org) dans votre navigateur, puis :

1. Dans les outils de développement de ce site, ouvrir **Application > Cookies > https://ia.francestudent.org** (ou **Stockage > Cookies** sous Firefox).
2. Copier uniquement la **valeur** du cookie `next-auth.session-token`.
3. Exécuter la commande suivante, puis coller la valeur **dans son invite masquée dans le Terminal** :

```sh
npm --prefix apps/server run connect -- --session
```

Cette valeur donne accès à votre compte : ne pas la coller dans le chat, GitHub, un fichier partagé, l'interface FranceStudent Web ou dans la ligne de commande elle-même. Ne pas exporter de fichier HAR ou l'ensemble de vos cookies.

## 3. Tester la connexion réelle

Vérifier l'authentification et les modèles, sans envoyer de message :

```sh
npm --prefix apps/server run check
```

Puis, pour créer **une véritable conversation de test** sur FranceStudent et vérifier le streaming :

```sh
npm --prefix apps/server run check -- --chat
```

Ce second test utilise le quota normal de votre compte et demande au premier modèle disponible de répondre « connexion réussie ». Le programme affiche la réponse, jamais le cookie ou le JWT.

## 4. Démarrer l'interface connectée

Depuis la racine du dépôt :

```sh
node scripts/start-local.mjs
```

Attendre que Next.js indique qu'il est prêt, puis ouvrir **http://127.0.0.1:3000**. Utiliser exactement cette adresse, et le **mot de passe local** créé à l'étape 2. Le serveur d'API écoute sur 127.0.0.1:4000 ; les deux processus restent limités à l'interface locale du Mac. Arrêt avec Ctrl+C.

Après connexion, le catalogue est chargé depuis FranceStudent. En cas d'échec, aucun faux modèle ni réponse simulée ne prend le relais. Un message indique l'erreur et l'envoi reste désactivé tant qu'aucun modèle n'est disponible.

## 5. Fonctionnement et limites de cette étape

- Le navigateur ne reçoit que sa session locale opaque, les modèles et les réponses. Le profil FranceStudent, ses identifiants, son cookie et son JWT ne sont jamais renvoyés au frontend.
- Création : POST `/chats/stream` ; continuation : POST `/chats/{chatId}` ; annulation : POST `/chats/{chatId}/stream/cancel`. Un nouveau chat est passé en privé par PATCH dès que son identifiant est reçu.
- Les instructions et documents texte sont envoyés au modèle pour créer le contexte. Les documents sont délimités comme des données non fiables. Modifier les fichiers ou instructions du contexte ouvre une nouvelle conversation distante avec l'historique local afin que le nouveau contexte soit pris en compte.
- Après un arrêt ou une erreur, **Réessayer** ouvre une nouvelle conversation distante avec l'historique utile, pour éviter de dupliquer silencieusement le dernier message dans le chat existant. Aucune suppression distante n'est déclenchée par la suppression de l'historique local.
- L'arrêt coupe le flux local et demande l'annulation distante. La confirmation distante peut être impossible si le réseau est interrompu ou si aucun identifiant de chat n'a encore été reçu.
- Les conversations et préférences restent dans ce navigateur, sous des clés liées à l'identifiant du compte **local**. La démonstration utilise un espace distinct. Il n'y a pas encore de synchronisation PostgreSQL ni de migration automatique depuis le site Sites.
- Le serveur conserve seulement les paramètres du propriétaire, la session FranceStudent et les correspondances de conversations dans `~/.francestudent-web` (dossier 0700, fichiers 0600). Le cookie est protégé par ces permissions OS, pas par un chiffrement applicatif. Le mot de passe local est haché avec scrypt ; les sessions web expirent après douze heures et à chaque redémarrage du serveur.
- Cette version sert un seul propriétaire local. Ce n'est pas encore un serveur multi-utilisateur déployable. HTTP et cookie sans Secure sont limités à la boucle locale ; une mise en ligne exige HTTPS et une adaptation de l'authentification.

Pour renouveler la connexion, arrêter l'application, lancer `npm --prefix apps/server run connect`, puis redémarrer. Le mode démonstration reste accessible avec `npm --prefix apps/web run dev` sans activer le mode connecté.

## 6. Erreurs utiles à transmettre

Transmettre uniquement le code et le message d'erreur : AUTH_REQUIRED, AUTH_NETWORK, RATE_LIMIT, CONFLICT, STREAM_TIMEOUT ou PARTIAL_STREAM. Ne transmettre ni cookies, ni JWT, ni mots de passe. Les détails bruts des réponses d'authentification ne sont pas exposés par le proxy.

Le contrat fourni est archivé dans `francestudent-openapi.json` (SHA-256 `1d2228353c151e0bf8ef53e997b7ffaaad24172af62b68c92180b08d8fa67ae1`). Il décrit un en-tête authorization nommé sessionToken ; la transformation session web → JWT vient de l'implémentation existante. Son URL de serveur générée en HTTP est ignorée : le client réel impose HTTPS pour FranceStudent. Ce contrat technique ne remplace pas les conditions d'utilisation de votre compte.
