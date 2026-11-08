import { randomUUID } from "node:crypto";
import { LocalStore } from "./store";
import { FranceStudentClient, ProviderError } from "../../../packages/francestudent-client/src/server";
const store = new LocalStore();
const client = new FranceStudentClient({ loadSession: () => store.session(), saveSession: value => store.write("session.json", value) });
try {
  const owner = await store.read<{ userId: string }>("owner.json");
  await client.profile(); const models = await client.listModels();
  console.log("Authentification FranceStudent : OK");
  console.log("Modèles :", models.map(m => m.name).join(", "));
  if (process.argv.includes("--chat")) {
    console.log("Test d’un véritable message FranceStudent :");
    for await (const chunk of client.stream({ userId: owner.userId, conversationId: randomUUID(), modelId: models[0].id, messages: [{ role: "user", content: "Réponds uniquement : connexion réussie." }], webSearch: false }, { signal: AbortSignal.timeout(360_000) })) process.stdout.write(chunk);
    console.log("\nStreaming : OK");
  }
} catch (error) { console.error(error instanceof ProviderError ? `${error.code} : ${error.message}` : "Configuration locale introuvable ou invalide. Lancez npm run setup."); process.exitCode = 1; }
