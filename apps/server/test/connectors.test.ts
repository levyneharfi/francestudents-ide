import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { LocalStore } from "../src/store";
import { ConnectorManager } from "../src/connectors/manager";
import { Vault } from "../src/connectors/vault";
import { OfficeAdapter, officeTools } from "../src/connectors/office";
import { apps } from "../src/connectors/catalog";
async function context(t: { after: Function }, request: typeof fetch) {
  const directory = await mkdtemp(path.join(tmpdir(), "fs-connectors-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new LocalStore(directory);
  const userId = randomUUID(),
    key = randomBytes(32);
  const manager = new ConnectorManager(store, userId, {
    fetch: request,
    key: async () => key,
    sessionActive: (s) => s === "active",
  });
  return { manager, store, userId, key, directory };
}
const configured = () => {
  process.env.FS_GOOGLE_CLIENT_ID = "test-client";
  process.env.FS_GOOGLE_CLIENT_SECRET = "test-client-secret";
};
const token = () =>
  new Response(
    JSON.stringify({
      access_token: "secret-access-token",
      refresh_token: "secret-refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    }),
    { headers: { "Content-Type": "application/json" } },
  );
async function connect(manager: ConnectorManager, app = "gmail") {
  const start = await manager.start(app, "active");
  const url = new URL(start.authorizationUrl!);
  await manager.complete("google", url.searchParams.get("state")!, "code");
  return url;
}
test("OAuth binds PKCE/state to the active session, consumes once, rejects denial and encrypts tokens", async (t) => {
  configured();
  let requestBody = "";
  const c = await context(t, async (_url, init) => {
    requestBody = String(init?.body);
    return token();
  });
  const u = await connect(c.manager);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    u.searchParams.get("redirect_uri"),
    "http://localhost:4000/api/connectors/oauth/callback/google",
  );
  assert.match(requestBody, /code_verifier=/);
  const file = await readFile(
    path.join(c.directory, "connectors.vault.json"),
    "utf8",
  );
  assert.doesNotMatch(file, /secret-access|secret-refresh|test-client/);
  await assert.rejects(
    () => c.manager.complete("google", u.searchParams.get("state")!, "code"),
    /expirée|utilisée/,
  );
  const bad = await c.manager.start("gmail", "inactive");
  await assert.rejects(
    () =>
      c.manager.complete(
        "google",
        new URL(bad.authorizationUrl!).searchParams.get("state")!,
        "code",
      ),
    /expirée/,
  );
  const denied = await c.manager.start("gmail", "active");
  await assert.rejects(
    () =>
      c.manager.complete(
        "google",
        new URL(denied.authorizationUrl!).searchParams.get("state")!,
        undefined,
        "access_denied",
      ),
    /refusée/,
  );
  const catalog = await c.manager.catalog();
  assert.equal(catalog.find((a) => a.id === "gmail")?.status, "connected");
  assert.doesNotMatch(
    JSON.stringify(catalog),
    /secret-access|secret-refresh|test-client-secret/,
  );
  await assert.rejects(() =>
    new Vault(
      c.store,
      randomUUID(),
      () => ({}),
      async () => c.key,
    ).read(),
  );
});
test("read calls execute automatically through MCP; writes require exact single-use approval", async (t) => {
  configured();
  let reads = 0,
    writes = 0;
  const c = await context(t, async (url, init) => {
    if (String(url).includes("/token")) return token();
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer secret-access-token",
    );
    if (String(url).includes("messages/send")) {
      writes++;
      return new Response('{"id":"sent"}', {
        headers: { "Content-Type": "application/json" },
      });
    }
    reads++;
    return new Response('{"messages":[{"id":"abc"}]}', {
      headers: { "Content-Type": "application/json" },
    });
  });
  await connect(c.manager);
  const conversationId = randomUUID(),
    signal = new AbortController().signal;
  const read = await c.manager.propose(
    { appId: "gmail", tool: "search", arguments: { query: "réunion" } },
    conversationId,
    signal,
  );
  assert.equal(read.operation.status, "succeeded");
  assert.equal(reads, 1);
  assert.equal(read.sources.length, 1);
  const pending = await c.manager.propose(
    {
      appId: "gmail",
      tool: "send",
      arguments: {
        to: ["test@example.test"],
        subject: "Réunion",
        body: "Bonjour",
      },
    },
    conversationId,
    signal,
  );
  assert.equal(pending.operation.status, "pending");
  assert.equal(writes, 0);
  const decisions = await Promise.all([
    c.manager.decide(pending.operation.id, true, signal),
    c.manager.decide(pending.operation.id, true, signal),
  ]);
  assert.equal(writes, 1);
  assert.ok(decisions.some((r) => r.operation.status === "succeeded"));
  await c.manager.decide(pending.operation.id, true, signal);
  assert.equal(writes, 1);
  const other = await c.manager.propose(
    {
      appId: "gmail",
      tool: "send",
      arguments: { to: ["test@example.test"], subject: "Non", body: "Refus" },
    },
    conversationId,
    signal,
  );
  await c.manager.decide(other.operation.id, false, signal);
  await c.manager.decide(other.operation.id, true, signal);
  assert.equal(writes, 1);
  await assert.rejects(
    () =>
      c.manager.propose(
        {
          appId: "gmail",
          tool: "send",
          arguments: { to: ["bad\r\nBcc: x"], subject: "x", body: "x" },
        },
        conversationId,
        signal,
      ),
    /invalides/,
  );
  await c.manager.disconnect("gmail");
  assert.equal(
    (await c.manager.catalog()).find((a) => a.id === "gmail")?.status,
    "disconnected",
  );
});
test("uncertain writes are persisted and never replayed; reconnect invalidates pending operations", async (t) => {
  configured();
  let writes = 0;
  const c = await context(t, async (url) => {
    if (String(url).includes("/token")) return token();
    writes++;
    throw new Error("network lost");
  });
  await connect(c.manager);
  const call = {
    appId: "gmail",
    tool: "send",
    arguments: { to: ["test@example.test"], subject: "Hello", body: "Bonjour" },
  };
  const conversationId = randomUUID(),
    signal = new AbortController().signal;
  const p = await c.manager.propose(call, conversationId, signal);
  const result = await c.manager.decide(p.operation.id, true, signal);
  assert.equal(result.operation.status, "uncertain");
  await c.manager.decide(p.operation.id, true, signal);
  assert.equal(writes, 1);
  const pending = await c.manager.propose(call, conversationId, signal);
  await connect(c.manager);
  await assert.rejects(
    () => c.manager.decide(pending.operation.id, true, signal),
    /compte externe a changé/,
  );
  const restarted = new ConnectorManager(c.store, c.userId, {
    fetch: async () => assert.fail(),
    key: async () => c.key,
  });
  assert.equal(
    (await restarted.operations(conversationId)).find(
      (o) => o.id === p.operation.id,
    )?.status,
    "uncertain",
  );
});
test("refresh is coalesced and never exposes tokens; permissions are surfaced", async (t) => {
  configured();
  let refreshes = 0;
  const c = await context(t, async (url) => {
    if (String(url).includes("/token")) {
      refreshes++;
      return token();
    }
    return new Response("{}", {
      headers: { "Content-Type": "application/json" },
    });
  });
  await connect(c.manager);
  const vault = new Vault<any>(
    c.store,
    c.userId,
    () => ({}),
    async () => c.key,
  );
  await vault.update((d) => {
    d.connections.gmail.expiresAt = Date.now() - 1;
  });
  const signal = new AbortController().signal;
  await Promise.all([
    c.manager.propose(
      { appId: "gmail", tool: "search", arguments: {} },
      randomUUID(),
      signal,
    ),
    c.manager.propose(
      { appId: "gmail", tool: "search", arguments: {} },
      randomUUID(),
      signal,
    ),
  ]);
  assert.equal(refreshes, 2);
});
test("office tools have schemas and classify all mutations; Outlook request paths are fixed", async () => {
  for (const app of apps.filter((a) =>
    ["google", "microsoft"].includes(a.family),
  )) {
    const tools = officeTools(app);
    assert.ok(tools.some((t) => t.readOnly));
    assert.ok(tools.some((t) => !t.readOnly));
    assert.ok(tools.every((t) => t.schema));
  }
  let sent = false;
  const adapter = new OfficeAdapter(async (url, init) => {
    assert.equal(String(url), "https://graph.microsoft.com/v1.0/me/sendMail");
    assert.equal(init?.redirect, "error");
    sent = true;
    return new Response(null, { status: 202 });
  });
  await adapter.execute(
    apps.find((a) => a.id === "outlook")!,
    "send",
    { to: ["x@example.test"], subject: "Test", body: "Bonjour" },
    "secret",
    new AbortController().signal,
  );
  assert.ok(sent);
});
test("OAuth expires, cancellation consumes state, and a restart marks in-flight writes uncertain", async (t) => {
  configured();
  const c = await context(t, async () => token());
  const start = await c.manager.start("gmail", "active");
  const state = new URL(start.authorizationUrl!).searchParams.get("state")!;
  const pending = (
    c.manager as unknown as { pending: Map<string, { expires: number }> }
  ).pending;
  pending.get(state)!.expires = Date.now() - 1;
  await assert.rejects(
    () => c.manager.complete("google", state, "code"),
    /expirée/,
  );
  const next = await c.manager.start("gmail", "active");
  c.manager.cancel("gmail", "active");
  await assert.rejects(
    () =>
      c.manager.complete(
        "google",
        new URL(next.authorizationUrl!).searchParams.get("state")!,
        "code",
      ),
    /expirée/,
  );
  await connect(c.manager);
  const conversationId = randomUUID();
  const p = await c.manager.propose(
    {
      appId: "gmail",
      tool: "send",
      arguments: { to: ["x@example.test"], subject: "Test", body: "Message" },
    },
    conversationId,
    new AbortController().signal,
  );
  const vault = new Vault<any>(
    c.store,
    c.userId,
    () => ({}),
    async () => c.key,
  );
  await vault.update((d) => {
    d.operations[p.operation.id].status = "running";
    d.operations[p.operation.id].executionId = "reserved-before-crash";
  });
  const restarted = new ConnectorManager(c.store, c.userId, {
    key: async () => c.key,
    fetch: async () => assert.fail(),
  });
  const firstDecision = await restarted.decide(p.operation.id,true,new AbortController().signal);
  assert.equal(firstDecision.operation.status,"uncertain");
  assert.equal(
    (await restarted.operations(conversationId))[0].status,
    "uncertain",
  );
  await restarted.decide(p.operation.id, true, new AbortController().signal);
});
