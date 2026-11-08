# Audit de réutilisation — 8 novembre 2026

Référence : `cea1f2b6e60a6d7fa400795f1e439f7cf9a0a31a`. Audit statique des implémentations, pas un audit exhaustif de sécurité.

| Module | Constat réel | Décision web |
| --- | --- | --- |
| `src/api/api.js` | POST `/chats/stream`, décodeur SSE incrémental, événements delta/completed/error, annulation distante, délais, renouvellement sur 401 et relances | Réutiliser les protocoles et tests côté serveur ; injecter transport, auth, état et événements |
| `src/api/auth.js` | Cookie `next-auth.session-token`, GET `/api/auth/api-token`, JWT court, marge de 60 s ; singleton `auth`, session.json local en 0600 | Serveur uniquement ; remplacer singleton et fichier global par stockage par utilisateur, JWT en mémoire et secret chiffré |
| `src/api/login.js` | Parcours Auth.js / WHMCS, formulaires et redirections manuelles ; refuse CAPTCHA / MFA ; sauvegarde du cookie | Ne pas transposer directement au web ; valider les conditions d'accès et un parcours d'autorisation supporté |
| `src/core/chat.js` | `send` sans affichage direct mais dépend de state, profils, contexte et conversations ; enregistrement après réponse réussie | Extraire une orchestration avec dépendances injectées ; conserver messages partiels et statuts |
| `src/core/session.js` | Bootstrap interactif, commandes CLI et routage chat/agent | Ne pas utiliser comme gestionnaire de requêtes HTTP |
| `src/state.js` | Singleton partagé : chatIds, history, modèle, fichiers en attente, workspace et options | Jamais partagé entre requêtes/utilisateurs ; contexte explicite par conversation |
| `src/api/agents.js` | GET `/chats/agents`, cache 5 min, repli KNOWN_MODELS ; pas de fichier models.js | Adapter le catalogue et les capacités ; cache limité au compte autorisé |
| `src/project/conversations.js` | history.json, métadonnées et compteur `messages`, cache et file de sauvegarde ; pas de transcription intégrale | Nouvelle persistance complète des messages |
| `src/project/profile.js`, `memory.js`, `project-context.js` | Profils, faits et résumés liés à des chemins locaux ; lecture disque et appels au modèle | Préserver les concepts, remplacer la persistance et les références disque |
| `src/agent/` | Agent avec outils, commandes, hooks, Git, worktrees et contexte machine | Conservé dans l'application source ; hors runtime web V1 |
| `src/mcp/` | Configuration JSON locale, clients stdio lancés via child_process, gestionnaire singleton | Réservé à une future exécution serveur isolée ; aucun lancement arbitraire depuis un navigateur |
| `desktop/` | Electron main/preload, IPC, fichiers, fenêtres, terminaux et node-pty | Préservé ; pas de migration directe |

## Risques principaux

1. **Mélange de comptes** : auth, state, usage et caches actuels sont globaux. Une simple façade HTTP serait dangereuse même si la V1 ne sert qu'une personne.
2. **Secrets côté client** : les modules API et auth ne doivent jamais être importés dans un composant client. Seuls les contrats sans runtime peuvent être partagés.
3. **Relances après un delta** : une relance peut dupliquer du texte ou une génération. La future adaptation devra distinguer échec avant/après émission et utiliser des identifiants stables.
4. **SSE interrompu** : la logique source peut retourner une sortie non vide à la fermeture du flux. Le serveur web devra distinguer fin confirmée, réponse partielle, erreur et annulation.
5. **Persistance locale** : index source incomplet pour une application de chat ; accès disque, caches et droits OS ne constituent pas un modèle multi-utilisateur.
6. **Fonctions natives** : Electron, Ink et node-pty imposent un contexte local. Installation web indépendante et frontière npm dédiée.
7. **Accès fournisseur** : endpoints et modèles sont observés dans le code, pas garantis par une documentation contractuelle. Aucune connexion réelle pendant cet audit.

## Licence et instructions

Le package source déclare ISC ; aucun fichier LICENSE autonome n'a été trouvé dans le commit audité. Conserver l'historique et les notices ; clarifier les conditions avant une redistribution plus large. Aucun AGENTS.md n'était présent dans cette référence. Le schéma fourni sert de contexte architectural et ne remplace pas l'inspection du code.

## Synchronisation upstream

Conserver les interfaces et scripts racine. Commits web distincts, puis intégrer les mises à jour sur une branche dédiée avec `git fetch upstream` et fusion contrôlée. Exécuter les tests concernés de l'original et les contrôles web avant intégration. Ne pas déplacer massivement les fichiers source.
