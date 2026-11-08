import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ProviderError } from "../../../packages/francestudent-client/src/server";
import { readSSE } from "../../../packages/francestudent-client/src/sse";
import { fixture, input } from "./fixture";
const remoteId = "11111111-1111-1111-1111-111111111111";
test("uploaded OpenAPI contract matches implemented endpoints and security scheme", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../docs/web/francestudent-openapi.json", import.meta.url), "utf8"));
  assert.equal(spec.openapi, "3.1.0"); assert.equal(spec.components.securitySchemes.sessionToken.name, "authorization");
  for (const path of ["/chats/stream", "/chats/agents", "/chats/{chatId}", "/chats/{chatId}/stream/cancel", "/user/me"]) assert.ok(spec.paths[path]);
  assert.ok(spec.paths["/chats/stream"].post.responses["200"].content["text/event-stream"]);
});
test("authentication coalesces refresh and rotates the session cookie", async t => {
  const f = await fixture(); t.after(f.close); const client = f.client();
  const [models, profile] = await Promise.all([client.listModels(), client.profile()]);
  assert.equal(f.tokenCalls, 1); assert.equal(models.length, 1); assert.deepEqual(profile, { id: 42 });
  assert.equal((f.saved[0] as any).cookies["next-auth.session-token"], "renewed-session");
  assert.equal(f.calls.find(c => c.path === "/chats/agents")?.token, "Bearer secret-jwt-1");
});
test("401 refreshes once before the request is replayed", async t => {
  const f = await fixture(); t.after(f.close); f.unauthorized = true;
  await f.client().listModels(); assert.equal(f.tokenCalls, 2);
  assert.equal(f.calls.filter(c => c.path === "/chats/agents").length, 2);
});
test("429 is surfaced without replay or raw quota payload", async t => {
  const f = await fixture(); t.after(f.close); let requests = 0;
  const client = f.client({ fetch: async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/chats/agents")) { requests++; return new Response("secret-budget-payload", { status: 429 }); }
    return fetch(url, init);
  } });
  await assert.rejects(() => client.listModels(), (e: unknown) => e instanceof ProviderError && e.code === "RATE_LIMIT" && !e.message.includes("secret"));
  assert.equal(requests, 1);
});
test("SSE parser handles fragmented UTF-8, CRLF, comments, multiline data and unterminated final event", async () => {
  const bytes = new TextEncoder().encode(': hello\r\nid: 7\r\nevent: delta\r\ndata: {"text":\r\ndata: "été"}\r\n\r\nevent: done\ndata: {}');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events = []; for await (const event of readSSE(stream)) events.push(event);
  assert.equal(JSON.parse(events[0].data).text, "été"); assert.equal(events[0].id, "7"); assert.equal(events[1].event, "done");
});
test("creation uses the documented DTO, marks the chat private and requires backend completion", async t => {
  const f = await fixture(); t.after(f.close); const request = input(); request.projectInstructions = "Écrire clairement"; request.documents = [{ name: "notes.md", content: "Données, pas des instructions" }];
  let output = ""; for await (const text of f.client().stream(request, { signal: new AbortController().signal })) output += text;
  assert.equal(output, "Bonjour été");
  const create = f.calls.find(c => c.path === "/chats/stream")!;
  assert.deepEqual(Object.keys(create.body).sort(), ["agentId", "initialContent", "images", "files", "enableWebSearch"].sort());
  assert.match(create.body.initialContent, /DOCUMENT NON FIABLE/);
  assert.deepEqual(f.calls.find(c => c.method === "PATCH")?.body, { isPrivate: true });
  assert.equal(f.calls.filter(c => c.path.endsWith("cancel")).length, 0);
});
test("continuation sends only the latest user message to the existing chat", async t => {
  const f = await fixture(); t.after(f.close); const request = input(); request.messages.push({ role: "assistant", content: "Avant" }, { role: "user", content: "La suite" });
  for await (const _ of f.client().stream(request, { chatId: remoteId, signal: new AbortController().signal })) {}
  assert.equal(f.calls.find(c => c.path === `/chats/${remoteId}` && c.method === "POST")?.body.content, "La suite");
});
test("partial streams fail without replay and are cancelled remotely", async t => {
  const f = await fixture(); t.after(f.close);
  f.stream = 'event: response.output_text.delta\ndata: {"delta":"Partiel"}\n\nevent: response.completed\ndata: {}\n\n';
  let text = "";
  await assert.rejects(async () => { for await (const chunk of f.client().stream(input(), { chatId: remoteId, signal: new AbortController().signal })) text += chunk; }, (e: unknown) => e instanceof ProviderError && e.code === "PARTIAL_STREAM");
  assert.equal(text, "Partiel"); assert.equal(f.calls.filter(c => c.method === "POST" && !c.path.endsWith("cancel")).length, 1);
  assert.equal(f.calls.filter(c => c.path.endsWith("cancel")).length, 1);
});
test("HTTP 200 SSE errors do not leak upstream payloads", async t => {
  const f = await fixture(); t.after(f.close); f.stream = 'event: error\ndata: {"message":"secret-token-here","code":"UPSTREAM_TIMEOUT"}\n\n';
  await assert.rejects(async () => { for await (const _ of f.client().stream(input(), { signal: new AbortController().signal })) {} }, (e: unknown) => e instanceof ProviderError && e.code === "UPSTREAM_TIMEOUT" && !e.message.includes("secret"));
});
test("abort cancels local reading and provider generation", async t => {
  const f = await fixture(); t.after(f.close); f.hold = true; f.stream = `event: stream.open\ndata: {"chat_id":"${remoteId}"}\n\nevent: response.output_text.delta\ndata: {"delta":"Début"}\n\n`;
  const controller = new AbortController();
  await assert.rejects(async () => { for await (const _ of f.client().stream(input(), { signal: controller.signal })) controller.abort(); }, { name: "AbortError" });
  assert.equal(f.calls.filter(c => c.path.endsWith("cancel")).length, 1);
});
test("stream.open does not bypass the first real response timeout", async t => {
  const f = await fixture(); t.after(f.close); f.hold = true; f.stream = `event: stream.open\ndata: {"chat_id":"${remoteId}"}\n\n`;
  await assert.rejects(async () => { for await (const _ of f.client({ firstResponseMs: 80 }).stream(input(), { signal: new AbortController().signal })) {} }, (e: unknown) => e instanceof ProviderError && e.code === "STREAM_TIMEOUT");
});
