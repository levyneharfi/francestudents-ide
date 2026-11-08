/** Declarative, browser-safe reply protocol. Never contains executable markup. */
export type ReplyBlock = {
  v: 1;
  id: string;
  title: string;
  description?: string;
  sourceIds?: string[];
} & (
  | { kind: "card"; text: string; status?: "info" | "pending" | "warning" }
  | {
      kind: "metrics";
      items: { label: string; value: string; detail?: string }[];
    }
  | { kind: "progress"; value: number; max: number; label: string }
  | { kind: "checklist"; items: { id: string; label: string }[] }
  | {
      kind: "form";
      fields: { id: string; label: string; options: string[] }[];
      submitLabel: string;
    }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | {
      kind: "chart";
      chart: "bar" | "line";
      unit: string;
      data: { label: string; value: number }[];
    }
  | { kind: "diagram"; code: string }
);
export interface ReplySource {
  id: string;
  label: string;
  url: string;
}
export interface ToolCall {
  appId: string;
  tool: string;
  arguments: Record<string, unknown>;
}
export interface ToolOperation {
  id: string;
  appId: string;
  tool: string;
  arguments: Record<string, unknown>;
  status:
    | "pending"
    | "running"
    | "succeeded"
    | "rejected"
    | "failed"
    | "uncertain";
  title: string;
  summary?: string;
  conversationId: string;
}
export type AIEvent =
  | { type: "text"; text: string }
  | { type: "block"; block: ReplyBlock; offset: number }
  | { type: "source"; source: ReplySource }
  | { type: "tool"; operation: ToolOperation }
  | { type: "done" }
  | { type: "error"; message: string };
export type WidgetState = Record<string, boolean | string>;
export interface PositionedBlock {
  block: ReplyBlock;
  offset: number;
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max = 1000): x is string =>
  typeof x === "string" && x.length <= max;
const list = (x: unknown, max: number, valid: (v: unknown) => boolean) =>
  Array.isArray(x) && x.length > 0 && x.length <= max && x.every(valid);
export const safeURL = (s: unknown): s is string => {
  if (!str(s, 2048)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
export function validBlock(x: unknown): x is ReplyBlock {
  if (
    !object(x) ||
    x.v !== 1 ||
    !str(x.id, 80) ||
    !/^[a-zA-Z0-9_-]+$/.test(x.id) ||
    !str(x.title, 200) ||
    (x.description !== undefined && !str(x.description, 2000)) ||
    (x.sourceIds !== undefined && !list(x.sourceIds, 20, (s) => str(s, 100)))
  )
    return false;
  switch (x.kind) {
    case "card":
      return (
        str(x.text, 6000) &&
        (x.status === undefined ||
          ["info", "pending", "warning"].includes(String(x.status)))
      );
    case "metrics":
      return list(
        x.items,
        12,
        (i) =>
          object(i) &&
          str(i.label, 120) &&
          str(i.value, 120) &&
          (i.detail === undefined || str(i.detail, 300)),
      );
    case "progress":
      return (
        Number.isFinite(x.value) &&
        Number.isFinite(x.max) &&
        Number(x.max) > 0 &&
        Number(x.value) >= 0 &&
        Number(x.value) <= Number(x.max) &&
        str(x.label, 200)
      );
    case "checklist":
      return (
        list(
          x.items,
          50,
          (i) =>
            object(i) &&
            str(i.id, 60) &&
            /^[\w-]+$/.test(i.id) &&
            str(i.label, 500),
        ) &&
        new Set((x.items as { id: string }[]).map((i) => i.id)).size ===
          (x.items as unknown[]).length
      );
    case "form":
      return (
        str(x.submitLabel, 100) &&
        list(
          x.fields,
          8,
          (i) =>
            object(i) &&
            str(i.id, 60) &&
            /^[\w-]+$/.test(i.id) &&
            str(i.label, 300) &&
            list(i.options, 12, (o) => str(o, 300)),
        ) &&
        new Set((x.fields as { id: string }[]).map((i) => i.id)).size ===
          (x.fields as unknown[]).length
      );
    case "table":
      return (
        list(x.columns, 12, (c) => str(c, 200)) &&
        list(
          x.rows,
          100,
          (r) =>
            Array.isArray(r) &&
            r.length === (x.columns as unknown[]).length &&
            r.every((c) => str(c, 2000)),
        )
      );
    case "chart":
      return (
        ["bar", "line"].includes(String(x.chart)) &&
        str(x.unit, 60) &&
        list(
          x.data,
          100,
          (d) =>
            object(d) &&
            str(d.label, 100) &&
            typeof d.value === "number" &&
            Number.isFinite(d.value),
        )
      );
    case "diagram":
      return (
        str(x.code, 12000) &&
        /^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|erDiagram)\b/.test(
          x.code,
        ) &&
        !/%%\{|<|>|\bclick\b|https?:|javascript:|data:|style\s|classDef\s|linkStyle\s/i.test(
          x.code.replace(/<?[-=.]+[<>]+/g, ""),
        )
      );
    default:
      return false;
  }
}
export function validCall(x: unknown): x is ToolCall {
  return (
    object(x) &&
    str(x.appId, 50) &&
    /^[a-z-]+$/.test(x.appId) &&
    str(x.tool, 100) &&
    /^[\w.-]+$/.test(x.tool) &&
    object(x.arguments) &&
    JSON.stringify(x.arguments).length <= 32000
  );
}
export function isGPT(model: { provider?: string; model?: string }): boolean {
  const provider = (model.provider || "").toLowerCase().replace(/[ _-]/g, "");
  return (
    ["openai", "azureopenai"].includes(provider) &&
    /^(?:gpt[- .]?|chatgpt|o[1-9](?:[- .]|$))/i.test(model.model || "")
  );
}
export const RICH_INSTRUCTIONS = `PRÉSENTATION DES RÉPONSES : choisis spontanément une présentation utile. Les réponses simples restent du texte Markdown. Pour une comparaison, des étapes, un choix ou des données, tu peux insérer un bloc JSON complet dans une clôture de code fs-ui, entouré de prose. Aucune interface ne doit être demandée explicitement par l'utilisateur. Pas de HTML, JavaScript, URL inventée ou résultat de vérification inventé. Format commun : {"v":1,"id":"identifiant-unique","kind":"...","title":"...","description":"facultatif"}. Types permis : card {text,status?:info|pending|warning}; metrics {items:[{label,value,detail?}]}; progress {value,max,label}; checklist {items:[{id,label}]} (coches manuelles initialement vides); form {fields:[{id,label,options:[string]}],submitLabel}; table {columns:[string],rows:[[string]]}; chart {chart:bar|line,unit:string,data:[{label,value:number}]}; diagram {code:string Mermaid flowchart ou sequenceDiagram sans HTML, styles, liens ni directives}. Ne génère pas de données quantitatives sans source ou sans les qualifier explicitement d'exemple fictif. Les sourceIds éventuels doivent être repris exclusivement des sources d'outils fournies. Utilise peu de composants, uniquement quand ils aident.`;
