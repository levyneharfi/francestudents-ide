// Offline integration fixture only. Production main.ts has no mock/provider URL switch.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { ConnectorManager } from "../src/connectors/manager";
import { LocalStore } from "../src/store";
import { createLocalServer } from "../src/server";
import { fixture } from "./fixture";
const provider = await fixture(); provider.delay = 1800;
const directory = await mkdtemp(path.join(tmpdir(), "fs-web-e2e-"));
const store = new LocalStore(directory); await store.createOwner("Local-e2e-password-123");
process.env.FS_GOOGLE_CLIENT_ID = "offline-fixture-client";
process.env.FS_GOOGLE_CLIENT_SECRET = "offline-fixture-secret";
provider.modelMetadata = { modelProvider:"openai", model:"gpt-4.1" };
provider.respond = body => {
  const content = String(body.content || body.initialContent || "");
  if (!/prépare un e-mail|J’ai confirmé|J’ai refusé/i.test(content)) return undefined;
  if (/J’ai confirmé/.test(content) && /"status":"succeeded"/.test(content)) return 'L’action confirmée a été exécutée.\n```fs-ui\n{"v":1,"id":"result","kind":"card","title":"Envoi terminé","text":"Le résultat serveur confirme l’envoi."}\n```';
  if (/J’ai refusé/.test(content)) return "L’action a été refusée ; aucun message supplémentaire n’a été envoyé.";
  return 'Voici le message à confirmer.\n```fs-tool\n{"appId":"gmail","tool":"send","arguments":{"to":["destinataire@example.test"],"subject":"Réunion","body":"Bonjour, préparons notre réunion."}}\n```';
};
const key = randomBytes(32);
const connectors = new ConnectorManager(store, (await store.read<{userId:string}>("owner.json")).userId, {
  key: async()=>key,
  fetch: async(url,init) => {
    if(String(url).endsWith("/token"))return Response.json({access_token:"offline-oauth-secret",refresh_token:"offline-refresh-secret",token_type:"Bearer",expires_in:3600});
    if(String(url).includes("messages/send"))return Response.json({id:"offline-message"});
    if(String(url).includes("revoke"))return new Response(null,{status:200});
    return Response.json({});
  }
});
const server = await createLocalServer({ store, client: provider.client(), connectors });
server.listen(4000, "127.0.0.1", () => console.log("Connected integration fixture ready (offline, no account credentials)."));
let stopped = false;
async function stop() { if (stopped) return; stopped = true; server.closeAllConnections(); server.close(); provider.close(); await rm(directory, { recursive: true, force: true }); }
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void stop(); });
