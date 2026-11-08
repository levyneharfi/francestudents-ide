import type { AIEvent } from "../../../packages/francestudent-client/src/replies";
import { exampleBlocks } from "./example-reply";
import type { AIProvider, AIRequest } from "../../../packages/francestudent-client/src/contracts";
export const models = [
  { id: "-1002", name: "GPT 6 Luna", description: "Rapide et polyvalent", provider: "openai", model: "gpt-6-luna", richResponses: true, tools: false },
  { id: "-1003", name: "GPT 6.1 Sol", description: "Réflexion et rédaction", provider: "openai", model: "gpt-6.1-sol", richResponses: true, tools: false },
  { id: "-2002", name: "Claude Haiku 5.5", description: "Clair et concis" },
  { id: "-2001", name: "Claude Opus 5.5", description: "Analyse approfondie" }
] as const;
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Arrêt demandé", "AbortError"));
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Arrêt demandé", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
export class MockProvider implements AIProvider {
  readonly capabilities = { streaming: true, webSearch: false, documents: true, tools: false, simulated: true };
  constructor(private delay = 30, private failAfterChunks = Infinity) {}
  listModels() { return models; }
  async *streamEvents(request: AIRequest, options: { signal: AbortSignal }): AsyncIterable<AIEvent> {
    let length = 0;
    for await (const text of this.stream(request, options)) { length += text.length; yield {type:"text",text}; }
    if (["-1002", "-1003"].includes(request.modelId) && /semaine|graphique|schéma|checklist|interacti/i.test(request.messages.at(-1)?.content || "")) {
      for (const block of exampleBlocks) { options.signal.throwIfAborted(); yield {type:"block",block,offset:length}; }
    }
    yield {type:"done"};
  }
  async *stream(request: AIRequest, { signal }: { signal: AbortSignal }): AsyncIterable<string> {
    const prompt = request.messages.at(-1)?.content.toLowerCase() || "";
    const intro = request.documents?.length ? `Vos documents (${request.documents.map(d => d.name).join(", ")}) sont disponibles dans le contexte local. Cette démonstration ne réalise pas leur analyse.\n\n` : "";
    let body = /bonjour|salut/.test(prompt)
      ? "Bonjour ! Prenons le temps de donner forme à vos idées. Vous pouvez préparer un plan, explorer une question ou organiser vos notes. Par quoi souhaitez-vous commencer ?"
      : /plan|mémoire|structur/.test(prompt)
      ? "Voici une trame pour avancer sereinement.\n\n1. Définir la question\nFormulez votre objectif en une phrase, puis identifiez les notions à explorer.\n\n2. Organiser les idées\nRegroupez vos arguments en trois parties. Pour chacune, prévoyez un exemple et les sources à vérifier.\n\n3. Affiner la rédaction\nReliez les parties, précisez les transitions et revenez à votre question de départ.\n\nQuelle partie aimeriez-vous développer en premier ?"
      : "Pour avancer, commençons par clarifier votre objectif.\n\nIdentifiez ce que vous souhaitez comprendre ou produire, puis rassemblez les éléments dont vous disposez. Vous pourrez ensuite organiser les idées essentielles et choisir une première étape concrète.\n\nCette réponse est un exemple simulé. La connexion à FranceStudent sera ajoutée dans une prochaine version.\n\nSouhaitez-vous construire un plan ou préciser votre question ?";
    if (request.webSearch) body += "\n\nRecherche web : simulation uniquement, aucune source externe n’a été consultée.";
    const chunks = (intro + body).match(/\S+\s*/g) || [];
    for (let n = 0; n < chunks.length; n++) {
      await wait(this.delay, signal);
      if (n >= this.failAfterChunks) throw new Error("La réponse a été interrompue. Vous pouvez réessayer.");
      yield chunks[n];
    }
  }
}
