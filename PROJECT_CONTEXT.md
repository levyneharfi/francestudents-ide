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

La création du fork GitHub est bloquée dans l'environnement initial par une connexion GitHub invalide et une requête de fork refusée. Le code conserve l'historique original localement. Ne pas présenter le fork distant comme créé avant vérification.

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
