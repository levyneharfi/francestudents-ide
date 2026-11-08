/** Browser-safe types. Authenticated implementations must remain server-only. */
export interface AIModel { id: string; name: string; description: string }
export interface AICapabilities { streaming: boolean; webSearch: boolean; documents: boolean; tools: boolean; simulated: boolean }
export interface AIRequest {
  userId: string;
  conversationId: string;
  modelId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  projectInstructions?: string;
  documents?: { name: string; content: string }[];
  webSearch: boolean;
}
export interface AIProvider {
  readonly capabilities: AICapabilities;
  listModels(): readonly AIModel[];
  stream(request: AIRequest, options: { signal: AbortSignal }): AsyncIterable<string>;
}
