import { type AppData, type Preferences, USER_ID, defaultPreferences, initialData } from "./domain";
export const DATA_KEY = "francestudent:web:v1:data";
export const PREFS_KEY = "francestudent:web:v1:appearance";
export const isAccent = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
export function parsePreferences(raw: string | null): Preferences {
  try {
    const p = JSON.parse(raw || "null");
    if (!p || p.userId !== USER_ID) return { ...defaultPreferences };
    return { userId: USER_ID, theme: ["dark", "light", "system"].includes(p.theme) ? p.theme : "dark", font: ["times", "georgia", "arial", "system"].includes(p.font) ? p.font : "times", accent: isAccent(p.accent) ? p.accent : null };
  } catch { return { ...defaultPreferences }; }
}
const text = (x: unknown): x is string => typeof x === "string";
const owned = (x: Record<string, unknown>) => x && x.userId === USER_ID && text(x.id);
export function parseData(raw: string | null): AppData {
  if (!raw) return initialData();
  const d = JSON.parse(raw);
  if (!d || d.version !== 1 || d.userId !== USER_ID || !Array.isArray(d.conversations) || !Array.isArray(d.projects) || !Array.isArray(d.documents)) throw new Error("Sauvegarde locale incompatible.");
  if (!d.projects.every((p: Record<string, unknown>) => owned(p) && text(p.name) && text(p.instructions)) ||
      !d.documents.every((f: Record<string, unknown>) => owned(f) && text(f.name) && text(f.content) && typeof f.size === "number" && (f.projectId === null || text(f.projectId))) ||
      !d.conversations.every((c: Record<string, unknown>) => owned(c) && text(c.title) && text(c.modelId) && text(c.updatedAt) && typeof c.favorite === "boolean" && (c.projectId === null || text(c.projectId)) && Array.isArray(c.messages) && c.messages.every((m: Record<string, unknown>) => owned(m) && text(m.content) && (m.modelId === undefined || text(m.modelId)) && ["user", "assistant"].includes(String(m.role)) && ["complete", "streaming", "stopped", "error"].includes(String(m.status))))) throw new Error("Sauvegarde locale endommagée.");
  const result = d as AppData;
  result.conversations.forEach(c => c.messages.forEach(m => { if (m.status === "streaming") m.status = "stopped"; }));
  result.activeId = result.conversations.some(c => c.id === result.activeId) ? result.activeId : result.conversations[0]?.id ?? null;
  result.webSearch = result.webSearch === true;
  return result;
}
export const MAX_DOCUMENT_BYTES = 256 * 1024;
export const MAX_LIBRARY_BYTES = 1024 * 1024;
export async function readDocument(file: File, existingBytes: number): Promise<{ name: string; content: string; size: number }> {
  if (!/\.(txt|md)$/i.test(file.name)) throw new Error("Choisissez un fichier texte (.txt) ou Markdown (.md).");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Ce document dépasse la limite de 256 Ko.");
  if (file.size + existingBytes > MAX_LIBRARY_BYTES) throw new Error("La bibliothèque locale est limitée à 1 Mo.");
  const content = await file.text();
  if (content.includes("\0")) throw new Error("Ce fichier ne semble pas être un document texte.");
  return { name: file.name, content, size: file.size };
}
export function applyPreferences(p: Preferences) {
  const dark = p.theme === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : p.theme === "dark";
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.font = p.font;
  root.style.setProperty("--accent", p.accent || (dark ? "#eeeeeb" : "#252523"));
  const rgb = (p.accent || (dark ? "#eeeeeb" : "#252523")).slice(1).match(/.{2}/g)!.map(x => { const n = parseInt(x, 16) / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
  const lum = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  root.style.setProperty("--on-accent", lum > .179 ? "#000000" : "#ffffff");
}
