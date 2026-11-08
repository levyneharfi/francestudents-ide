export interface AppDefinition {
  id: string;
  name: string;
  category: "Bureautique" | "Développement" | "Communication";
  description: string;
  family: "google" | "microsoft" | "github" | "notion" | "linear" | "slack";
  scopes: string[];
  permissions: string[];
  remote?: string;
  hosts?: string[];
}
const google = "https://www.googleapis.com/auth/";
export const apps: AppDefinition[] = [
  {
    id: "google-drive",
    name: "Google Drive",
    category: "Bureautique",
    description: "Rechercher, lire et gérer vos documents texte.",
    family: "google",
    scopes: [google + "drive"],
    permissions: [
      "Rechercher et lire vos fichiers",
      "Créer, modifier et mettre à la corbeille après confirmation",
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Bureautique",
    description:
      "Rechercher des e-mails, préparer un brouillon ou envoyer un message.",
    family: "google",
    scopes: [google + "gmail.readonly", google + "gmail.compose"],
    permissions: [
      "Rechercher et lire vos messages",
      "Créer des brouillons et envoyer après confirmation",
    ],
  },
  {
    id: "google-calendar",
    name: "Agenda Google",
    category: "Bureautique",
    description: "Consulter votre agenda et organiser vos événements.",
    family: "google",
    scopes: [google + "calendar.events"],
    permissions: [
      "Lire les événements",
      "Créer, modifier et annuler après confirmation",
    ],
  },
  {
    id: "outlook",
    name: "Outlook",
    category: "Bureautique",
    description: "Consulter vos messages Microsoft et préparer vos réponses.",
    family: "microsoft",
    scopes: ["offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"],
    permissions: [
      "Rechercher et lire vos messages",
      "Créer des brouillons et envoyer après confirmation",
    ],
  },
  {
    id: "onedrive",
    name: "OneDrive",
    category: "Bureautique",
    description: "Rechercher et gérer vos fichiers texte Microsoft.",
    family: "microsoft",
    scopes: ["offline_access", "User.Read", "Files.ReadWrite"],
    permissions: [
      "Rechercher et lire vos fichiers",
      "Créer, modifier et supprimer après confirmation",
    ],
  },
  {
    id: "microsoft-calendar",
    name: "Calendrier Microsoft",
    category: "Bureautique",
    description: "Organiser votre calendrier personnel ou professionnel.",
    family: "microsoft",
    scopes: ["offline_access", "User.Read", "Calendars.ReadWrite"],
    permissions: [
      "Lire les événements",
      "Créer, modifier et annuler après confirmation",
    ],
  },
  {
    id: "github",
    name: "GitHub",
    category: "Développement",
    description: "Dépôts, tickets et demandes de fusion via le MCP officiel.",
    family: "github",
    scopes: ["repo", "read:user"],
    permissions: [
      "Consulter les dépôts autorisés",
      "Confirmer les outils pouvant modifier des données",
    ],
    remote: "https://api.githubcopilot.com/mcp/",
    hosts: ["api.githubcopilot.com", "github.com", "api.github.com"],
  },
  {
    id: "notion",
    name: "Notion",
    category: "Bureautique",
    description: "Rechercher et travailler sur vos pages via le MCP officiel.",
    family: "notion",
    scopes: [],
    permissions: [
      "Accéder aux espaces autorisés",
      "Confirmer les outils pouvant modifier des données",
    ],
    remote: "https://mcp.notion.com/mcp",
    hosts: ["mcp.notion.com", "api.notion.com", "www.notion.so", "notion.so"],
  },
  {
    id: "linear",
    name: "Linear",
    category: "Développement",
    description: "Rechercher et gérer tickets et projets via le MCP officiel.",
    family: "linear",
    scopes: ["read", "write"],
    permissions: [
      "Lire les tickets et projets",
      "Confirmer les outils pouvant modifier des données",
    ],
    remote: "https://mcp.linear.app/mcp",
    hosts: ["mcp.linear.app", "linear.app", "api.linear.app"],
  },
  {
    id: "slack",
    name: "Slack",
    category: "Communication",
    description: "Rechercher dans les espaces et échanger via le MCP officiel.",
    family: "slack",
    scopes: [],
    permissions: [
      "Accéder aux espaces autorisés",
      "Confirmer les outils pouvant publier ou modifier des données",
    ],
    remote: "https://mcp.slack.com/mcp",
    hosts: ["mcp.slack.com", "slack.com", "api.slack.com"],
  },
];
export function appById(id: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) throw new Error("Application inconnue.");
  return app;
}
export function oauthConfig(app: AppDefinition) {
  const prefix = `FS_${app.family.toUpperCase()}`;
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
  };
}
export function configured(app: AppDefinition) {
  if (["notion", "linear"].includes(app.family)) return true; // MCP OAuth dynamic registration.
  const c = oauthConfig(app);
  return !!c.clientId && !!c.clientSecret;
}
