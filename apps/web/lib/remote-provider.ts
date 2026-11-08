import type { AIModel, AIProvider, AIRequest } from "../../../packages/francestudent-client/src/contracts";
import type { AIEvent } from "../../../packages/francestudent-client/src/replies";
import { validBlock, safeURL } from "../../../packages/francestudent-client/src/replies";
import { readSSE } from "../../../packages/francestudent-client/src/sse";
export class RemoteProvider implements AIProvider {
  readonly capabilities = { streaming: true, webSearch: true, documents: true, tools: true, simulated: false };
  async listModels(): Promise<AIModel[]> {
    const response = await fetch("/api/models", { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Modèles FranceStudent indisponibles.");
    if (!Array.isArray(value.models) || !value.models.length) throw new Error("Aucun modèle FranceStudent disponible.");
    return value.models;
  }
  async *stream(request: AIRequest & { fresh?: boolean }, options: { signal: AbortSignal }): AsyncIterable<string> {
    for await (const event of this.streamEvents(request, options)) if (event.type === "text") yield event.text;
  }
  async *streamEvents(request: AIRequest & { fresh?: boolean }, { signal }: { signal: AbortSignal }): AsyncIterable<AIEvent> {
    const requestId = crypto.randomUUID(); let cancelSent = false;
    const cancel = () => { if (cancelSent) return; cancelSent = true; void fetch("/api/chat/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }), keepalive: true }).catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true }); let complete = false;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...request, requestId }), signal });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Le serveur FranceStudent local est indisponible."); }
      if (!response.body) throw new Error("Le serveur n’a pas renvoyé de flux.");
      for await (const event of readSSE(response.body, signal)) {
        const data = JSON.parse(event.data);
        if (event.event === "delta" && typeof data.text === "string") yield { type: "text", text: data.text };
        else if (event.event === "block" && validBlock(data.block) && Number.isInteger(data.offset) && data.offset >= 0) yield { type: "block", block: data.block, offset: data.offset };
        else if (event.event === "source" && data.source && safeURL(data.source.url) && typeof data.source.id === "string" && typeof data.source.label === "string") yield { type: "source", source: data.source };
        else if (event.event === "tool" && data.operation && typeof data.operation.id === "string") yield { type: "tool", operation: data.operation };
        else if (event.event === "error") throw new Error(data.error || "La réponse FranceStudent a été interrompue.");
        else if (event.event === "done") { complete = true; yield { type: "done" }; break; }
      }
      if (!complete) throw new Error("Réponse interrompue. Le texte partiel est conservé.");
    } finally { signal.removeEventListener("abort", cancel); if (!complete) cancel(); }
  }
}
