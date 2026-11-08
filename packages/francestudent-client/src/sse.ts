/** Browser-safe SSE framing, reused by the local proxy and the provider adapter. */
export interface SSEEvent { event: string; data: string; id?: string }
export async function* readSSE(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncIterable<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", name = "", lines: string[] = [], lastId: string | undefined;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  function line(value: string): SSEEvent | undefined {
    if (!value) {
      const result = lines.length ? { event: name || "message", data: lines.join("\n"), id: lastId } : undefined;
      name = ""; lines = []; return result;
    }
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const field = colon < 0 ? value : value.slice(0, colon);
    let data = colon < 0 ? "" : value.slice(colon + 1); if (data.startsWith(" ")) data = data.slice(1);
    if (field === "event") name = data;
    else if (field === "data") lines.push(data);
    else if (field === "id" && !data.includes("\0")) lastId = data;
  }
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Arrêt demandé", "AbortError");
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new DOMException("Arrêt demandé", "AbortError");
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length + lines.join("\n").length > 1_000_000) throw new Error("Événement SSE trop volumineux.");
      while (buffer.length) {
        const pos = buffer.search(/[\r\n]/);
        if (pos < 0 || (buffer[pos] === "\r" && pos === buffer.length - 1 && !done)) break;
        const size = buffer[pos] === "\r" && buffer[pos + 1] === "\n" ? 2 : 1;
        const result = line(buffer.slice(0, pos)); buffer = buffer.slice(pos + size);
        if (result) yield result;
      }
      if (done) { if (buffer) line(buffer); const final = line(""); if (final) yield final; break; }
    }
  } finally { signal?.removeEventListener("abort", abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
