import { createRequire } from "node:module";
import { LocalStore, type Owner } from "./store";
import { ConnectorManager } from "./connectors/manager";
const require = createRequire(import.meta.url);
const { ui } = require("../../../src/cli/ui.js");
try {
  const store = new LocalStore();
  const owner = await store.read<Owner>("owner.json");
  const family = process.argv[2];
  if (
    !["google", "microsoft", "github", "slack", "notion", "linear"].includes(
      family,
    )
  )
    throw new Error(
      "Usage : npm run configure:apps -- google|microsoft|github|slack|notion|linear",
    );
  console.log(
    `Configuration OAuth ${family}, réservée à l’administrateur. Les identifiants sont enregistrés dans le coffre chiffré.`,
  );
  console.log(
    `URI de retour à enregistrer : http://localhost:4000/api/connectors/oauth/callback/${family}`,
  );
  const clientId = String((await ui.ask("Client ID : ")) || "").trim();
  const clientSecret = String(
    (await ui.askSecret("Client Secret (saisie masquée) : ")) || "",
  ).trim();
  await new ConnectorManager(store, owner.userId).configure(family, {
    clientId,
    clientSecret,
  });
  console.log(
    "Configuration enregistrée. Redémarrez le serveur local puis ouvrez Applications > Connecter.",
  );
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.message : "Configuration impossible.");
  process.exit(1);
}
