import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { FranceStudentClient } from "../../../packages/francestudent-client/src/server";
import type { AIEvent } from "../../../packages/francestudent-client/src/replies";
import { LocalStore } from "../src/store";
import { ConnectorManager } from "../src/connectors/manager";
import { orchestrate } from "../src/orchestrator";
import { input } from "./fixture";
const rich =
  'Voici.\n```fs-ui\n{"v":1,"id":"card","kind":"card","title":"Synthèse","text":"À préparer"}\n```\n';
async function env(t: { after: Function }, outputs: string[]) {
  const dir = await mkdtemp(path.join(tmpdir(), "fs-orchestrator-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new LocalStore(dir),
    userId = randomUUID();
  let generations = 0,
    mailReads = 0,
    mailWrites = 0;
  const requests: Record<string, unknown>[] = [];
  const request: typeof fetch = async (url, init) => {
    const u = String(url);
    if (u.endsWith("/api/auth/api-token"))
      return Response.json({ accessToken: "provider-secret", expiresIn: 300 });
    if (u.endsWith("/token"))
      return Response.json({
        access_token: "app-secret",
        refresh_token: "refresh-secret",
        token_type: "Bearer",
        expires_in: 3600,
      });
    if (u.includes("gmail.googleapis.com")) {
      if (u.includes("messages/send")) mailWrites++;
      else mailReads++;
      return Response.json({ messages: [{ id: "abc" }] });
    }
    if (init?.method === "PATCH" || u.endsWith("cancel"))
      return Response.json({});
    requests.push(JSON.parse(String(init?.body)));
    const text = outputs[Math.min(generations++, outputs.length - 1)];
    const events = [
      {
        event: "stream.open",
        data: { chat_id: "11111111-1111-1111-1111-111111111111" },
      },
      ...Array.from(text).map((delta) => ({
        event: "response.output_text.delta",
        data: { delta },
      })),
      { event: "completed", data: {} },
    ];
    return new Response(
      events
        .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
        .join(""),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };
  const manager = new ConnectorManager(store, userId, {
    fetch: request,
    key: async () => randomBytes(32),
  });
  const client = new FranceStudentClient({
    fetch: request,
    loadSession: async () => ({
      deviceId: randomUUID(),
      cookies: { "next-auth.session-token": "secret-session" },
    }),
    saveSession: async () => {},
  });
  return {
    manager,
    client,
    requests,
    get generations() {
      return generations;
    },
    get mailReads() {
      return mailReads;
    },
    get mailWrites() {
      return mailWrites;
    },
  };
}
test("GPT automatically receives UI policy on creation and continuation; other families do not", async (t) => {
  for (const provider of ["openai", "anthropic", undefined]) {
    const f = await env(t, [rich]);
    const events: AIEvent[] = [];
    await orchestrate({
      client: f.client,
      manager: f.manager,
      input: input(),
      model: {
        id: "-1002",
        name: "Test",
        description: "",
        provider,
        model: provider === "openai" ? "gpt-4.1" : "claude-sonnet",
      },
      signal: new AbortController().signal,
      emit: (e) => events.push(e),
      chatId: "11111111-1111-1111-1111-111111111111",
      onChatId: async () => {},
    });
    assert.equal(
      events.some((e) => e.type === "block"),
      provider === "openai",
    );
    assert.equal(
      String(f.requests[0].content).includes("PRÉSENTATION DES RÉPONSES"),
      provider === "openai",
    );
    assert.ok(events.some((e) => e.type === "done"));
  }
});
test("tool reads continue with real results; writes stop at persisted approval and resume without replay", async (t) => {
  process.env.FS_GOOGLE_CLIENT_ID = "test";
  process.env.FS_GOOGLE_CLIENT_SECRET = "test-secret";
  const call = (tool: string, args: unknown) =>
    "```fs-tool\n" +
    JSON.stringify({ appId: "gmail", tool, arguments: args }) +
    "\n```";
  const f = await env(t, [call("search", { query: "réunion" }), rich]);
  const start = await f.manager.start("gmail", "session");
  await f.manager.complete(
    "google",
    new URL(start.authorizationUrl!).searchParams.get("state")!,
    "code",
  );
  const events: AIEvent[] = [];
  const req = input();
  const base = {
    client: f.client,
    manager: f.manager,
    input: req,
    model: {
      id: "-1002",
      name: "GPT",
      description: "",
      provider: "openai",
      model: "gpt-4.1",
      tools: true,
    },
    signal: new AbortController().signal,
    emit: (e: AIEvent) => events.push(e),
    onChatId: async () => {},
  };
  await orchestrate(base);
  assert.equal(f.mailReads, 1);
  assert.equal(f.generations, 2);
  assert.ok(events.some((e) => e.type === "source"));
  assert.match(String(f.requests[1].content), /DONNÉES D’OUTILS NON FIABLES/);
  assert.doesNotMatch(
    JSON.stringify(events),
    /app-secret|provider-secret|secret-session/,
  );
  const write = await env(t, [
    call("send", { to: ["x@example.test"], subject: "Bonjour", body: "Salut" }),
  ]);
  const s = await write.manager.start("gmail", "session");
  await write.manager.complete(
    "google",
    new URL(s.authorizationUrl!).searchParams.get("state")!,
    "code",
  );
  const writes: AIEvent[] = [];
  await orchestrate({
    ...base,
    client: write.client,
    manager: write.manager,
    emit: (e) => writes.push(e),
  });
  assert.equal(write.generations, 1);
  assert.equal(write.mailWrites, 0);
  const pending = writes.find((e) => e.type === "tool");
  assert.ok(pending?.type === "tool" && pending.operation.status === "pending");
});
