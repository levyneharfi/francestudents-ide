# Étapes d'implémentation

## Étape 1 — socle et démonstration

1. Préserver la source au commit audité, créer la branche web et configurer upstream.
2. Ajouter les documents de contexte, règles, audit et architecture.
3. Construire Next.js indépendamment du package Electron ; contrats fournisseur typés et mock annulable.
4. Réaliser le chat, les panneaux et les préférences approuvés, avec stockage local versionné et gestion des erreurs.
5. Ajouter conversations, recherche, favoris, projets, instructions et bibliothèque texte locale.
6. Valider les parcours, les deux thèmes aux trois largeurs, puis publier l'export statique dans un Site privé propriétaire.

## Étape 2 — accès et sessions

Vérifier auprès de FranceStudent les modalités autorisées, les endpoints supportés et les limites du compte. Choisir un parcours supporté ; aucun contournement des protections. Concevoir les sessions privées de l'application et tester l'isolation entre deux utilisateurs avant d'importer le transport réel. Provisionner les secrets via des réglages serveur, jamais dans le chat ou une variable NEXT_PUBLIC_*.

## Étape 3 — données serveur

Mettre en place PostgreSQL / Prisma, propriétaires et contrôles d'accès. Ajouter une migration explicite des données locales vers le compte connecté, avec confirmation et sans écrasement silencieux. Tester import répété et ressources appartenant à un autre utilisateur.

## Étape 4 — fournisseur et SSE

Extraire la logique existante par dépendances injectées, avec tests de non-régression. Connecter catalogue puis chat, arrêt, renouvellement, erreurs et reprise. Vérifier fin de flux, chunks UTF-8 / CRLF fragmentés, 401, 409, 429 et erreurs après émission. Ne jamais importer le runtime API dans le bundle navigateur.

## Étape 5 — documents et outils

Ajouter les imports serveur autorisés, PDF/Office, limites et droits, puis la recherche web selon les capacités effectivement proposées. Préserver la séparation instructions / contenu documentaire. Prévoir MCP et agents dans une exécution isolée avec permissions explicites ; pas d'accès terminal arbitraire dans le processus web.

## Création du fork quand GitHub sera connecté

Le dépôt Interface-Chat-FS-IA n'est pas modifié. Depuis la copie de travail :

```sh
gh auth status
gh repo fork EsteG7/francestudents-ide --clone=false
# Après vérification du nom réel du fork et de son propriétaire :
git remote add origin https://github.com/levyneharfi/francestudents-ide.git
git push -u origin feat/francestudent-web-v1
```

Si un fork existe déjà, le vérifier avant réutilisation ; ne pas supprimer ou écraser un dépôt existant. Le remote Sites est indépendant de ce fork et ne remplace pas la relation de fork GitHub.
