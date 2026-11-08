# FranceStudent Web

## Décisions retenues

- Source : https://github.com/EsteG7/francestudents-ide ; référence auditée : `cea1f2b6e60a6d7fa400795f1e439f7cf9a0a31a`.
- Créer un fork GitHub distinct ; préserver l'historique et le remote upstream. Le dépôt `levyneharfi/Interface-Chat-FS-IA` reste intact.
- Ajouter un frontend web indépendant, sans transformer Electron et sans supprimer CLI, TUI, agent ou MCP existants.
- Cible : Next.js / React / TypeScript / Tailwind ; serveur Node.js / TypeScript, PostgreSQL / Prisma, sessions privées, SSE.
- Organisation : `apps/web`, `apps/server`, `packages/francestudent-client`.
- Conserver le moteur de communication autant que possible, après suppression de ses états globaux partagés côté serveur.
- Utilisation personnelle d'abord ; toutes les données métier portent un userId dès la démonstration.

## Interface approuvée

Chat central, navigation gauche repliable, contexte droit repliable. Sur mobile les panneaux deviennent des tiroirs. Apparence premium, sobre, sans dégradés décoratifs ni couleur imposée. Concept ordinateur sombre et mobile clair validé le 8 novembre 2026.

Valeurs par défaut : thème sombre, Times New Roman (repli Times / Liberation Serif / serif), aucune accentuation. Préférences : clair, sombre, automatique ; Times New Roman, Georgia, Arial, système ; accents prédéfinis et personnalisés ; application immédiate et sauvegarde locale.

## Livraison V1

- Chat et modèles **simulés**, génération progressive annulable, historique local complet, favoris et recherche locale.
- Projets, instructions persistantes, rattachement des conversations.
- Documents `.txt` / `.md` lus localement, 256 Ko par document, bibliothèque de 1 Mo. Aucun envoi externe, aucune analyse IA réelle.
- Outils explicitement simulés, MCP futur. L'interrupteur web ne consulte aucun moteur de recherche.
- Export statique Next.js et démonstration **privée, propriétaire uniquement**, via Sites.
- Stockage local versionné : conversations, messages, projets, documents, préférences. Aucun partage entre appareils. Le userId `demo-local` est une étiquette de propriétaire local et ne garantit aucune isolation sécurisée.
- Aucun fournisseur connecté, aucune clé OpenAI nécessaire, aucun cookie / mot de passe / JWT FranceStudent manipulé.

## Contraintes de sécurité et de compatibilité

Les modalités d'accès autorisées à FranceStudent doivent être confirmées avant activation. Le parcours reproduit dans l'application source n'est pas une autorisation API. Ne pas contourner CAPTCHA ou MFA. Aucun formulaire de collecte de cookies ou identifiants FranceStudent dans la V1.

Les documents importés sont des données non fiables, distinctes des instructions du projet. Le lecteur affiche du texte brut, y compris le Markdown ; pas de HTML injecté. La protection d'accès de Sites protège l'URL ; la persistance de la démonstration reste dans le navigateur.

Le fork https://github.com/levyneharfi/francestudents-ide a été créé par le propriétaire et vérifié. La branche feat/francestudent-web-v1 contient le commit e548d34. L’authentification du CLI GitHub de l’environnement reste invalide ; utiliser le connecteur GitHub autorisé ou la procédure de transfert Git, sans exposer de secret.

## Exécution

Node.js >=22. Installer uniquement le frontend :

```sh
npm --prefix apps/web ci
npm --prefix apps/web run dev
npm --prefix apps/web run typecheck
npm --prefix apps/web test
npm --prefix apps/web run build
npm --prefix apps/web run test:e2e
```

Le build produit `apps/web/out` et copie l'export dans `out` à la racine pour l'hébergement statique. Voir `docs/web/ARCHITECTURE.md`, `AUDIT.md`, `IMPLEMENTATION_PLAN.md` et `VERIFICATION.md`.

## Connexion locale réelle — étape suivante autorisée

À la demande explicite de l'utilisateur, prioriser la connexion réelle avant PostgreSQL. Le fichier OpenAPI fourni est conservé dans docs/web/francestudent-openapi.json. Le mode local connecté utilise un serveur Node.js avec une authentification propre, un adaptateur FranceStudent à état isolé, un catalogue réel et du SSE réseau. Aucun repli silencieux sur le mock. Le parcours terminal de connexion existant est réutilisé ; les secrets ne sont jamais saisis dans notre interface web.

L'historique reste dans le navigateur, sous un identifiant local distinct de demo-local ; les correspondances FranceStudent sont persistées dans le dossier privé du compte OS. Un changement de contexte ou une nouvelle tentative explicite peut créer un nouveau chat distant. L'aperçu Sites reste statique et simulé. Cette livraison ne prétend pas activer le multi-utilisateur ni PostgreSQL.

Voir docs/web/LOCAL_CONNECTION.md pour l'installation Mac et les limites de validation. Le protocole est testé hors ligne ; le test authentifié avec le compte du propriétaire doit se faire sur son Mac, car l'environnement cloud n'a pas accès au domaine FranceStudent et ne possède aucun secret de compte.

## Réponses interactives et applications MCP

Le propriétaire a confirmé que le chat FranceStudent fonctionne sur son Mac. La maquette des réponses interactives ordinateur/mobile a été approuvée. Les réponses enrichies automatiques ciblent la famille ChatGPT/OpenAI identifiée par métadonnées ; les outils sont proposés aux familles compatibles avec la grammaire contrôlée. Les autres modèles gardent leur présentation textuelle.

Priorité bureautique : Google Drive, Gmail, Agenda, Outlook, OneDrive et Calendrier Microsoft, pour comptes personnels et professionnels. GitHub, Notion, Linear et Slack utilisent les MCP distants officiels. Les identifiants OAuth sont configurés une fois par l’administrateur ; les utilisateurs connectent ensuite leurs comptes via le consentement officiel. Les lectures sont automatiques après connexion, toutes les écritures nécessitent confirmation.

Le serveur garde ses sessions personnelles locales et le coffre MCP chiffré, avec clé dans le Trousseau macOS. L’historique navigateur migre vers la version 2 ; PostgreSQL reste la cible future. Les sources CLI/TUI/Electron sont préservées. Aucun accès direct OpenAI n’est ajouté. La démonstration Sites existante reste statique et simulée ; cette étape ne change pas son déploiement.

Voir docs/web/INTERACTIVE_MCP.md pour l’installation, la configuration des dix applications, les limites concrètes et le protocole. Les tests OAuth/MCP cloud utilisent des services de test ; l’activation des comptes externes réels et le Trousseau natif restent à vérifier sur Mac. L’authentification GitHub CLI est de nouveau disponible dans cet environnement au moment de cette livraison.
