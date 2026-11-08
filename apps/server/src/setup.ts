import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { LocalStore } from "./store";
import { FranceStudentClient } from "../../../packages/francestudent-client/src/server";

const store = new LocalStore();
// Reuse the upstream terminal-only login implementation; never import it into the HTTP server.
process.env.FS_DATA_DIR = store.directory;
process.env.FS_ORIGIN = "https://ia.francestudent.org";
process.env.FS_API_URL = "https://api.francestudent.ai";
const require = createRequire(import.meta.url);
const { ui } = require("../../../src/cli/ui.js");
const { setUiBackend } = require("../../../src/ui-bridge.js");
setUiBackend({ debug() {}, warn() {}, info() {}, spinner() { return { stop() {} }; } });
try {
  let owner;
  try { owner = await store.read("owner.json"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (!owner) {
    console.log("Créez un mot de passe pour votre application locale (distinct de FranceStudent).");
    const password = String(await ui.askSecret("Nouveau mot de passe local : ") || "");
    const confirmation = String(await ui.askSecret("Confirmer : ") || "");
    if (password !== confirmation) throw new Error("Les mots de passe ne correspondent pas.");
    await store.createOwner(password); console.log("Compte local créé.");
  }
  if (process.argv.includes("--session")) {
    const cookie = String(await ui.askSecret("Cookie de session FranceStudent (saisie masquée) : ") || "").trim();
    if (!cookie || /[\r\n;]/.test(cookie)) throw new Error("Valeur de session invalide.");
    await store.write("session.json", { deviceId: randomUUID(), cookies: { "next-auth.session-token": cookie } });
  } else {
    console.log("Connexion FranceStudent dans le Terminal. Le mot de passe ne sera pas enregistré.");
    const email = String(await ui.ask("E-mail FranceStudent : ") || "").trim();
    const password = String(await ui.askSecret("Mot de passe FranceStudent : ") || "");
    const auth = require("../../../src/api/auth.js");
    await auth.loadSession();
    try { await require("../../../src/api/login.js").loginWithPassword({ email, password }); }
    catch { throw new Error("Connexion FranceStudent impossible (identifiants, MFA, CAPTCHA ou réseau). Utilisez votre navigateur pour vous connecter, puis la commande connect -- --session si nécessaire."); }
  }
  const client = new FranceStudentClient({ loadSession: () => store.session(), saveSession: value => store.write("session.json", value) });
  await client.profile(); const models = await client.listModels();
  console.log(`Connexion vérifiée : ${models.length} modèles disponibles. Aucun secret n’a été affiché.`);
  console.log("Démarrage depuis la racine du projet : node scripts/start-local.mjs");
  process.exit(0);
} catch (error) { console.error(error instanceof Error ? error.message : "Configuration impossible."); process.exit(1); }
