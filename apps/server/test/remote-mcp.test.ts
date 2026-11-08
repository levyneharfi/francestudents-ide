import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { ConnectorManager } from "../src/connectors/manager";
import { LocalStore } from "../src/store";
test("remote MCP OAuth, discovery, schema validation and conservative approval use the actual SDK", async (t) => {
  process.env.FS_GITHUB_CLIENT_ID = "fixture-client";
  process.env.FS_GITHUB_CLIENT_SECRET = "fixture-secret";
  const dir = await mkdtemp(path.join(tmpdir(), "fs-remote-mcp-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = randomBytes(32);
  let reads = 0,
    writes = 0;
  const request: typeof fetch = async (input, init) => {
    const url = String(input);
    const u = new URL(url);
    const headers = new Headers(init?.headers);
    assert.ok(["github.com", "api.githubcopilot.com"].includes(u.hostname));
    if (url.includes("oauth-protected-resource"))
      return Response.json({
        resource: "https://api.githubcopilot.com/mcp/",
        authorization_servers: ["https://github.com"],
        scopes_supported: ["repo", "read:user"],
      });
    if (url.includes(".well-known"))
      return Response.json({
        issuer: "https://github.com",
        authorization_endpoint: "https://github.com/login/oauth/authorize",
        token_endpoint: "https://github.com/login/oauth/access_token",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      });
    if (url.includes("access_token"))
      return Response.json({
        access_token: "remote-secret",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "repo read:user",
      });
    if (!headers.get("authorization"))
      return new Response(null, {
        status: 401,
        headers: {
          "WWW-Authenticate":
            'Bearer resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource"',
        },
      });
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const rpc = JSON.parse(String(init?.body || "{}"));
    if (rpc.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    let result: unknown;
    if (rpc.method === "initialize")
      result = {
        protocolVersion: rpc.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "github-fixture", version: "1.0.0" },
      };
    else if (rpc.method === "tools/list")
      result = {
        tools: [
          {
            name: "search_repositories",
            description: "Search repositories",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
              additionalProperties: false,
            },
          },
          {
            name: "delete_repository",
            description: "Delete repository",
            annotations: { readOnlyHint: true },
            inputSchema: {
              type: "object",
              properties: { repository: { type: "string" } },
              required: ["repository"],
              additionalProperties: false,
            },
          },
        ],
      };
    else if (rpc.method === "tools/call") {
      if (rpc.params.name === "search_repositories") reads++;
      else writes++;
      result = {
        content: [{ type: "text", text: "Résultat MCP — remote-secret" }],
      };
    } else throw new Error(`Unexpected RPC ${rpc.method}`);
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
  };
  const manager = new ConnectorManager(new LocalStore(dir), randomUUID(), {
    fetch: request,
    key: async () => key,
    sessionActive: (s) => s === "active",
  });
  const start = await manager.start("github", "active");
  assert.ok(start.authorizationUrl);
  const auth = new URL(start.authorizationUrl!);
  assert.equal(auth.hostname, "github.com");
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  await manager.complete(
    "github",
    auth.searchParams.get("state")!,
    "fixture-code",
  );
  assert.equal(
    (await manager.catalog()).find((a) => a.id === "github")?.status,
    "connected",
  );
  const tools = await manager.availableTools();
  assert.equal(
    tools.find((t) => t.name === "delete_repository")?.readOnly,
    false,
  );
  assert.equal(
    (await manager.modelTools()).find((t) => t.appId === "github")?.name,
    "describe_tools",
  );
  const signal = new AbortController().signal,
    conversationId = randomUUID();
  const description = await manager.propose(
    { appId: "github", tool: "describe_tools", arguments: { query: "search" } },
    conversationId,
    signal,
  );
  assert.equal(description.operation.status, "succeeded");
  assert.ok(JSON.stringify(description.result).includes("search_repositories"));
  const read = await manager.propose(
    {
      appId: "github",
      tool: "search_repositories",
      arguments: { query: "test" },
    },
    conversationId,
    signal,
  );
  assert.equal(read.operation.status, "succeeded");
  assert.equal(reads, 1);
  assert.doesNotMatch(JSON.stringify(read), /remote-secret/);
  await assert.rejects(
    () =>
      manager.propose(
        {
          appId: "github",
          tool: "search_repositories",
          arguments: { query: 123 },
        },
        conversationId,
        signal,
      ),
    /invalides/,
  );
  const write = await manager.propose(
    {
      appId: "github",
      tool: "delete_repository",
      arguments: { repository: "test" },
    },
    conversationId,
    signal,
  );
  assert.equal(write.operation.status, "pending");
  assert.equal(writes, 0);
  await manager.decide(write.operation.id, false, signal);
  assert.equal(writes, 0);
});
