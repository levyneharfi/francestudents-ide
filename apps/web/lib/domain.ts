export const USER_ID = "demo-local";
export type Theme = "dark" | "light" | "system";
export type Font = "times" | "georgia" | "arial" | "system";
export interface Preferences { userId: string; theme: Theme; font: Font; accent: string | null }
export interface Message {
  id: string; userId: string; role: "user" | "assistant"; content: string;
  status: "complete" | "streaming" | "stopped" | "error"; modelId?: string;
}
export interface Conversation {
  id: string; userId: string; title: string; modelId: string; projectId: string | null;
  favorite: boolean; updatedAt: string; messages: Message[];
}
export interface Project { id: string; userId: string; name: string; instructions: string }
export interface Document { id: string; userId: string; name: string; content: string; size: number; projectId: string | null }
export interface AppData {
  version: 1; userId: string; conversations: Conversation[]; projects: Project[];
  documents: Document[]; activeId: string | null; webSearch: boolean;
}
export const defaultPreferences: Preferences = { userId: USER_ID, theme: "dark", font: "times", accent: null };
export const id = () => crypto.randomUUID();
export function newConversation(projectId: string | null = null, modelId = "-1002"): Conversation {
  return { id: id(), userId: USER_ID, title: "Nouvelle conversation", modelId, projectId, favorite: false, updatedAt: new Date().toISOString(), messages: [] };
}
export function initialData(): AppData {
  return {
    version: 1, userId: USER_ID, activeId: "welcome", webSearch: false,
    projects: [{ id: "memoire", userId: USER_ID, name: "Mon mémoire", instructions: "M’aider à rédiger et structurer mon mémoire, avec un style académique clair et rigoureux." }],
    documents: [{ id: "notes", userId: USER_ID, name: "notes.md", size: 135, projectId: "memoire", content: "# Notes de recherche\n\nSujet : les usages du numérique dans l’apprentissage.\n\nÀ explorer : autonomie, méthodes et accès aux connaissances." }],
    conversations: [{
      id: "welcome", userId: USER_ID, title: "Structurer mon mémoire", modelId: "-1002", projectId: "memoire", favorite: false, updatedAt: "2026-11-08T00:00:00Z",
      messages: [
        { id: "welcome-user", userId: USER_ID, role: "user", content: "Aide-moi à structurer mon mémoire.", status: "complete" },
        { id: "welcome-assistant", userId: USER_ID, role: "assistant", modelId: "-1002", content: "Commençons par une structure claire. Voici une première trame à adapter à votre sujet.\n\n1. Introduction\nPrésentez le sujet, son contexte et votre problématique. Précisez les objectifs et la méthode de votre recherche.\n\n2. Développement\nOrganisez votre analyse en parties cohérentes, avec des arguments, des exemples et une discussion critique.\n\n3. Conclusion\nSynthétisez les principaux résultats, répondez à la problématique et ouvrez sur de nouvelles perspectives.\n\nQuel est le sujet de votre mémoire ?", status: "complete" }
      ]
    }]
  };
}
