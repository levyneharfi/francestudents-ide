# Vérification — réponses interactives et MCP

Date : 8 novembre 2026. Branche : `feat/interactive-responses-mcp`, basée sur `feat/francestudent-live-local`.

## Contrôles exécutés

| Contrôle | Résultat |
| --- | --- |
| TypeScript serveur et frontend | Réussi |
| Tests serveur : protocole FranceStudent, parser, orchestrateur, OAuth, coffre et MCP | 25 réussis |
| Tests unitaires frontend, migration et persistance | 7 réussis |
| Parcours navigateur de la démonstration | 20 réussis |
| Parcours navigateur du mode connecté | 2 réussis |
| Construction Next.js export statique | Réussie |
| Construction Next.js mode connecté | Réussie, sans export |
| Recherche de signatures sensibles dans le bundle public | Aucune trouvée |
| Modification des sources upstream `src/`, `desktop/`, `bin/` et du package racine | Aucune |

Les deux parcours supplémentaires rejouant spécifiquement les interactions et le catalogue ont aussi réussi après les corrections.

## Scénarios couverts

- Réponses GPT enrichies sans demande de composant ; réponses des autres familles conservées en texte.
- Politique GPT appliquée aux créations et continuations, selon les métadonnées du fournisseur et du modèle.
- Parser de blocs résistant à chaque coupure possible et au streaming caractère par caractère ; formats invalides et arrêt partiel sans exécution d’outil.
- Graphiques Recharts, schémas Mermaid, tableaux Markdown, code copiable et formules KaTeX ; HTML et liens exécutables neutralisés.
- Cases cochées et choix de formulaire retrouvés après rechargement ; une soumission ajoute un message et reste marquée envoyée pendant la réponse suivante.
- Migration de la version 1 vers la version 2 ; historique, projets et documents préservés.
- OAuth : PKCE, état consommé une seule fois, liaison à la session, refus, expiration, annulation et renouvellement coalescé.
- Coffre AES-GCM : jetons absents du fichier en clair et refus de déchiffrement avec un autre propriétaire.
- MCP bureautique via le SDK et son transport mémoire ; MCP distant via OAuth, Streamable HTTP, découverte et validation de schéma avec le SDK réel et un service de test.
- Lecture automatique ; écriture proposée sans exécution ; refus ; approbations concurrentes exécutant l’appel une seule fois ; reconnexion invalidant les propositions antérieures.
- Écriture incertaine conservée et non rejouée ; reprise après redémarrage, y compris une réservation interrompue avant lancement.
- Un outil distant qui déclare abusivement `readOnlyHint: true` reste soumis à confirmation s’il ne figure pas dans les outils de lecture reconnus.
- Parcours navigateur connecté : fenêtre OAuth → retour local → proposition d’e-mail → rechargement avant confirmation → confirmation → réponse GPT enrichie → rechargement → déconnexion.

## Contrôle visuel

Vues 390, 768 et 1440 px, thèmes clair et sombre, sans débordement de page ni saisie masquée. Rendu testé avec réduction des animations. Les captures générées se trouvent dans `artifacts/web-rich/` pour les réponses et le catalogue ; elles sont des artefacts locaux de test, exclus du dépôt. Les captures historiques de V1 sont préservées.

Les vues ordinateur sombre, mobile clair et catalogue mobile ont été examinées visuellement. La composition conserve le chat central, les panneaux repliables, la police et les couleurs neutres approuvées. Les chiffres des graphiques de démonstration portent une mention explicite d’exemple fictif.

## Portée des validations

Les 54 tests utilisent des services locaux ou des réponses HTTP de test. Ils vérifient les protocoles, le rendu et les contrôles d’exécution ; ils ne prouvent pas l’accès aux vrais comptes Google, Microsoft, GitHub, Notion, Linear ou Slack. Aucun e-mail réel n’a été envoyé et aucun compte externe du propriétaire n’a été modifié pendant cette vérification.

Le propriétaire a confirmé le fonctionnement de sa connexion FranceStudent sur Mac avant cette étape. Il reste à vérifier sur ce Mac :

1. Création et déverrouillage natifs de la clé dans le Trousseau.
2. Configuration des clients OAuth et consentement des comptes personnels/professionnels.
3. Disponibilité des outils et contraintes administrateur des MCP officiels.
4. Production de composants valides par les modèles réels du catalogue, utilisation des outils et contrôles de quota.
5. Une lecture et une écriture explicitement confirmée dans chaque application activée.

Le guide `INTERACTIVE_MCP.md` donne les URI de retour, les scopes, les commandes de configuration et les limites des formats de fichiers. La démonstration privée Sites existante n’a pas été redéployée ; le nouveau code est destiné au serveur local.
