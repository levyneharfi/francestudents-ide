import { createLocalServer } from "./server";
try {
  const server = await createLocalServer();
  server.listen(4000, "127.0.0.1", () => console.log("Serveur FranceStudent local : http://127.0.0.1:4000 — secrets conservés dans le dossier privé du compte système."));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { server.closeAllConnections(); server.close(); });
} catch { console.error("Configuration locale absente ou invalide. Lancez npm --prefix apps/server run setup."); process.exitCode = 1; }
