# FranceStudent Web — démonstration

Depuis ce dossier : `npm ci`, `npm run dev` puis http://localhost:3000.
Vérification : `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.

Les tests navigateur utilisent Chromium à `/usr/bin/chromium` par défaut. Pour une autre installation, définir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, ou installer le navigateur Playwright et utiliser son chemin.

Tout est simulé et persiste dans ce navigateur. Il n'y a aucune connexion à FranceStudent. Les fichiers restent locaux et sont affichés en texte brut. Le build produit un export statique et le copie dans `../../out` pour Sites.
