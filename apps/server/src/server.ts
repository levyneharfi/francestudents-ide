import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { LocalStore, type Owner, verifyPassword } from "./store";
import { FranceStudentClient, ProviderError } from "../../../packages/francestudent-client/src/server";
import type { AIRequest } from "../../../packages/francestudent-client/src/contracts";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const uuid = (s: unknown): s is string => typeof s === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s);
class HTTPError extends Error { constructor(public status: number, message: string) { super(message); } }
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new HTTPError(415, "JSON requis.");
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of req) { const part = Buffer.from(chunk); bytes += part.length; if (bytes > 2_000_000) throw new HTTPError(413, "Requête trop volumineuse."); chunks.push(part); }
  const text = Buffer.concat(chunks).toString("utf8");
  try { const value = JSON.parse(text); if (value && !Array.isArray(value) && typeof value === "object") return value; } catch {}
  throw new HTTPError(400, "Requête JSON invalide.");
}
const json = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
function validateChat(value: Record<string, unknown>, userId: string): AIRequest & { requestId: string; fresh: boolean } {
  if (!uuid(value.conversationId) || !uuid(value.requestId) || typeof value.modelId !== "string" || !/^-?\d{1,12}$/.test(value.modelId) || !Array.isArray(value.messages) || !value.messages.length || value.messages.length > 150) throw new HTTPError(400, "Conversation ou modèle invalide.");
  const messages = value.messages as AIRequest["messages"];
  if (!messages.every(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 100_000) || messages.at(-1)?.role !== "user") throw new HTTPError(400, "Messages invalides.");
  if (value.projectInstructions !== undefined && (typeof value.projectInstructions !== "string" || value.projectInstructions.length > 6000)) throw new HTTPError(400, "Instructions invalides.");
  if (value.documents !== undefined && (!Array.isArray(value.documents) || value.documents.length > 30 || !value.documents.every(d => d && typeof d.name === "string" && d.name.length <= 255 && typeof d.content === "string" && d.content.length <= 262144))) throw new HTTPError(400, "Documents invalides.");
  return { userId, conversationId: value.conversationId, requestId: value.requestId, fresh: value.fresh === true, modelId: value.modelId, messages, projectInstructions: value.projectInstructions as string | undefined, documents: value.documents as AIRequest["documents"], webSearch: value.webSearch === true };
}
export async function createLocalServer(options: { store?: LocalStore; client?: FranceStudentClient; origin?: string } = {}) {
  const store = options.store || new LocalStore();
  const owner = await store.read<Owner>("owner.json");
  if (!uuid(owner.userId)) throw new Error("Compte local invalide. Lancez npm run setup.");
  const client = options.client || new FranceStudentClient({ loadSession: () => store.session(), saveSession: value => store.write("session.json", value) });
  const origin = options.origin || "http://127.0.0.1:3000";
  const sessions = new Map<string, number>(), attempts: number[] = [], recentRequests = new Map<string, number>();
  const active = new Map<string, { controller: AbortController; conversationId: string }>();
  let mappings: Record<string, { userId: string; accountId: number; remoteId: string; context: string }>;
  try { mappings = await store.read("chats.json"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; mappings = {}; }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    const host = req.headers.host || "";
    if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) return json(res, 403, { error: "Hôte local requis." });
    const path = new URL(req.url || "/", "http://localhost").pathname;
    const token = /(?:^|;\s*)fs_web_session=([^;]+)/.exec(req.headers.cookie || "")?.[1] || "";
    const authenticated = (sessions.get(digest(token)) || 0) > Date.now();
    if (req.method !== "GET" && req.headers.origin !== origin) return json(res, 403, { error: "Origine refusée." });
    try {
      if (path === "/api/session" && req.method === "GET") return json(res, 200, { authenticated, ...(authenticated ? { userId: owner.userId } : {}) });
      if (path === "/api/session" && req.method === "POST") {
        const now = Date.now(); while (attempts[0] < now - 600_000) attempts.shift();
        if (attempts.length >= 10) throw new HTTPError(429, "Trop de tentatives. Réessayez dans dix minutes.");
        const input = await body(req); attempts.push(now);
        if (typeof input.password !== "string" || !verifyPassword(owner, input.password)) throw new HTTPError(401, "Mot de passe local incorrect.");
        attempts.length = 0;
        for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key);
        if (sessions.size >= 20) sessions.delete(sessions.keys().next().value!);
        const value = randomBytes(32).toString("base64url"); sessions.set(digest(value), now + 12 * 3600_000);
        res.setHeader("Set-Cookie", `fs_web_session=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=43200`);
        return json(res, 200, { authenticated: true, userId: owner.userId });
      }
      if (!authenticated) return json(res, 401, { error: "Connectez-vous à votre espace local." });
      if (path === "/api/session" && req.method === "DELETE") {
        sessions.delete(digest(token));
        for (const generation of active.values()) generation.controller.abort();
        res.setHeader("Set-Cookie", "fs_web_session=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0"); return json(res, 200, { authenticated: false });
      }
      if (path === "/api/models" && req.method === "GET") return json(res, 200, { models: await client.listModels(), capabilities: client.capabilities });
      if (path === "/api/chat/cancel" && req.method === "POST") {
        const input = await body(req); if (typeof input.requestId !== "string") throw new HTTPError(400, "Génération invalide.");
        active.get(input.requestId)?.controller.abort(); return json(res, 200, { stopped: true });
      }
      if (path !== "/api/chat" || req.method !== "POST") return json(res, 404, { error: "Route inconnue." });
      const input = validateChat(await body(req), owner.userId);
      for (const [key, time] of recentRequests) if (time < Date.now() - 3600_000) recentRequests.delete(key);
      if (recentRequests.has(input.requestId)) throw new HTTPError(409, "Cette demande a déjà été traitée. Aucune génération supplémentaire n’a été lancée.");
      if ([...active.values()].some(g => g.conversationId === input.conversationId) || active.size >= 2) throw new HTTPError(409, "Une génération est déjà en cours. Arrêtez-la avant de continuer.");
      const generation = { controller: new AbortController(), conversationId: input.conversationId };
      active.set(input.requestId, generation); recentRequests.set(input.requestId, Date.now());
      res.on("close", () => { if (!res.writableEnded) generation.controller.abort(); });
      try {
        const account = await client.profile();
        if (generation.controller.signal.aborted) { json(res, 409, { error: "Réponse arrêtée." }); return; }
        const context = digest(JSON.stringify({ instructions: input.projectInstructions || "", documents: input.documents || [] }));
        const previous = mappings[input.conversationId];
        const remoteId = !input.fresh && previous?.userId === owner.userId && previous.accountId === account.id && previous.context === context ? previous.remoteId : undefined;
        res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
        const event = (name: string, value: unknown) => { if (!res.destroyed) res.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`); };
        event("meta", { requestId: input.requestId });
        for await (const delta of client.stream(input, { signal: generation.controller.signal, chatId: remoteId, onChatId: async remoteId => {
          if (!uuid(remoteId)) throw new ProviderError("INVALID_CHAT", "Identifiant de conversation FranceStudent invalide.");
          mappings[input.conversationId] = { userId: owner.userId, accountId: account.id, remoteId, context };
          await store.write("chats.json", mappings);
        } })) event("delta", { text: delta });
        event("done", {});
      } catch (error) {
        if (res.headersSent && !res.destroyed) res.write(`event: error\ndata: ${JSON.stringify({ code: generation.controller.signal.aborted ? "STOPPED" : error instanceof ProviderError ? error.code : "SERVER_ERROR", error: generation.controller.signal.aborted ? "Réponse arrêtée." : error instanceof ProviderError ? error.message : "La réponse n’a pas pu aboutir." })}\n\n`);
        else if (!res.headersSent) throw error;
      } finally { active.delete(input.requestId); if (res.headersSent && !res.writableEnded) res.end(); }
    } catch (error) {
      if (res.headersSent) return res.end();
      const status = error instanceof HTTPError ? error.status : error instanceof ProviderError ? error.status : 500;
      json(res, status, { error: error instanceof HTTPError || error instanceof ProviderError ? error.message : "Erreur du serveur local. Vérifiez la configuration dans le Terminal." });
    }
  });
  server.on("close", () => { for (const g of active.values()) g.controller.abort(); sessions.clear(); });
  return server;
}
