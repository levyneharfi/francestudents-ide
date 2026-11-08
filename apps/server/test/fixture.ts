import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { FranceStudentClient, ProviderError } from "../../../packages/francestudent-client/src/server";
import { readSSE } from "../../../packages/francestudent-client/src/sse";
import type { AIRequest } from "../../../packages/francestudent-client/src/contracts";
import { randomUUID } from "node:crypto";
const remoteId = "11111111-1111-1111-1111-111111111111";
export const input = (): AIRequest => ({ userId: randomUUID(), conversationId: randomUUID(), modelId: "-1002", messages: [{ role: "user", content: "Bonjour" }], webSearch: false });
export async function fixture() {
  const calls: { path: string; method: string; body: any; token?: string }[] = [];
  let tokenCalls = 0, unauthorized = false, stream = `event: stream.open\ndata: {"chat_id":"${remoteId}"}\n\nevent: response.output_text.delta\ndata: {"delta":"Bonjour été"}\n\nevent: response.completed\ndata: {}\n\nevent: completed\ndata: {"chat_id":"${remoteId}"}\n\n`;
  let hold = false, delay = 0; let modelMetadata = {}; let respond: ((body: any) => string | undefined) | undefined;
  const server = createServer(async (req, res) => {
    const parts: Buffer[] = []; for await (const part of req) parts.push(part);
    const value = Buffer.concat(parts).toString(); const path = req.url!;
    calls.push({ path, method: req.method!, body: value ? JSON.parse(value) : null, token: req.headers.authorization });
    res.setHeader("Content-Type", "application/json");
    if (path === "/api/auth/api-token") { tokenCalls++; res.setHeader("Set-Cookie", "next-auth.session-token=renewed-session; Path=/; HttpOnly"); res.end(JSON.stringify({ accessToken: `secret-jwt-${tokenCalls}`, expiresIn: 300 })); }
    else if (path === "/chats/agents") {
      if (unauthorized) { unauthorized = false; res.writeHead(401); return res.end(); }
      res.end(JSON.stringify([{ id: -1002, name: "Modèle réel test", isActive: true, ...modelMetadata }, { id: -999, name: "Disabled", isActive: false }]));
    } else if (path === "/user/me") res.end(JSON.stringify({ id: 42, email: "private@example.test" }));
    else if ((path === "/chats/stream" || path === `/chats/${remoteId}`) && req.method === "POST") {
      res.setHeader("Content-Type", "text/event-stream");
      const generated = respond?.(value ? JSON.parse(value) : {});
      if (generated !== undefined) { res.end(`event: stream.open\ndata: {"chat_id":"${remoteId}"}\n\nevent: response.output_text.delta\ndata: ${JSON.stringify({delta:generated})}\n\nevent: completed\ndata: {}\n\n`); return; }
      const split = stream.indexOf('event: response.completed');
      if (delay && split > 0) {
        res.write(stream.slice(0, split));
        const timer = setTimeout(() => res.end(stream.slice(split)), delay);
        res.on('close', () => clearTimeout(timer));
      } else { res.write(stream); if (!hold) res.end(); }
    } else if ((path === `/chats/${remoteId}` && req.method === "PATCH") || path.endsWith("/stream/cancel")) res.end("{}");
    else { res.writeHead(500); res.end("secret-upstream-token-must-not-leak"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const session = { deviceId: randomUUID(), cookies: { "next-auth.session-token": "secret-session" } };
  const saved: unknown[] = [];
  const client = (extra = {}) => new FranceStudentClient({ origin: url, apiUrl: url, loadSession: async () => structuredClone(session), saveSession: async value => { saved.push(value); }, ...extra });
  return { client, calls, saved, set modelMetadata(value: object) { modelMetadata = value; }, set respond(value: ((body:any)=>string|undefined) | undefined) {respond=value;}, get tokenCalls() { return tokenCalls; }, set unauthorized(value: boolean) { unauthorized = value; }, set stream(value: string) { stream = value; }, set hold(value: boolean) { hold = value; }, set delay(value: number) { delay = value; }, close: () => { server.closeAllConnections(); server.close(); } };
}
