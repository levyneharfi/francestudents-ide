"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Check, ExternalLink, Search } from "lucide-react";
import { Modal } from "./modal";
import { safeURL } from "../../../packages/francestudent-client/src/replies";
interface App {
  id: string;
  name: string;
  category: string;
  description: string;
  permissions: string[];
  configured: boolean;
  status: string;
  toolCount: number;
  revision?: number;
  oauthStatus?: string;
}
const examples: App[] = [
  [
    "google-drive",
    "Google Drive",
    "Bureautique",
    "Rechercher, lire et gérer vos documents texte.",
  ],
  [
    "gmail",
    "Gmail",
    "Bureautique",
    "Lire les messages et préparer vos réponses.",
  ],
  [
    "google-calendar",
    "Agenda Google",
    "Bureautique",
    "Consulter et organiser vos événements.",
  ],
  [
    "outlook",
    "Outlook",
    "Bureautique",
    "Rechercher et gérer vos e-mails Microsoft.",
  ],
  [
    "onedrive",
    "OneDrive",
    "Bureautique",
    "Rechercher et gérer vos fichiers texte.",
  ],
  [
    "microsoft-calendar",
    "Calendrier Microsoft",
    "Bureautique",
    "Organiser vos événements Microsoft.",
  ],
  [
    "github",
    "GitHub",
    "Développement",
    "Dépôts, tickets et demandes de fusion.",
  ],
  ["notion", "Notion", "Bureautique", "Vos pages et espaces de travail."],
  ["linear", "Linear", "Développement", "Tickets et projets d’équipe."],
  ["slack", "Slack", "Communication", "Messages et espaces d’équipe."],
].map(([id, name, category, description]) => ({
  id,
  name,
  category,
  description,
  permissions: [
    "Lecture et recherche après autorisation",
    "Confirmation avant toute modification ou envoi",
  ],
  configured: false,
  status: "disconnected",
  toolCount: 0,
}));
export function Applications({
  connected,
  onClose,
}: {
  connected: boolean;
  onClose: () => void;
}) {
  const [apps, setApps] = useState<App[]>(connected ? [] : examples);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [disconnect, setDisconnect] = useState<string | null>(null);
  const popup = useRef<Window | null>(null);
  const waiting = useRef<{
    id: string;
    revision?: number;
    expires: number;
  } | null>(null);
  useEffect(() => {
    if (!connected) return;
    const abort = new AbortController();
    let running = false;
    async function load() {
      if (running) return;
      running = true;
      try {
        const r = await fetch("/api/connectors", {
          cache: "no-store",
          signal: abort.signal,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Applications indisponibles.");
        if (abort.signal.aborted) return;
        setApps(data.apps);
        setError("");
        const w = waiting.current;
        const app = w && data.apps.find((a: App) => a.id === w.id);
        if (w && app?.status === "connected" && app.revision !== w.revision) {
          popup.current?.close();
          waiting.current = null;
          setBusy(null);
          setNotice(`${app.name} est connectée.`);
        } else if (
          w &&
          (app?.oauthStatus === "failed" || Date.now() > w.expires)
        ) {
          waiting.current = null;
          setBusy(null);
          popup.current?.close();
          setError(
            "Connexion refusée, interrompue ou expirée. Vérifiez les permissions et la configuration ; vous pouvez réessayer.",
          );
        }
      } catch (e) {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Applications indisponibles.",
          );
      } finally {
        running = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => {
      abort.abort();
      clearInterval(timer);
      popup.current?.close();
    };
  }, [connected]);
  async function connect(app: App) {
    popup.current = window.open(
      "about:blank",
      "francestudent-oauth",
      "popup,width=650,height=760",
    );
    if (!popup.current) {
      setError(
        "Autorisez l’ouverture de la fenêtre de connexion dans ce navigateur.",
      );
      return;
    }
    setBusy(app.id);
    setError("");
    try {
      const r = await fetch(`/api/connectors/${app.id}/connect`, {
        method: "POST",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Connexion impossible.");
      if (data.connected) {
        popup.current.close();
        setBusy(null);
        setNotice(`${app.name} est déjà connectée.`);
        return;
      }
      if (!safeURL(data.authorizationUrl))
        throw new Error("Adresse d’authentification invalide.");
      waiting.current = {
        id: app.id,
        revision: app.revision,
        expires: Date.now() + 600000,
      };
      popup.current.location.href = data.authorizationUrl;
    } catch (e) {
      popup.current?.close();
      setBusy(null);
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    }
  }
  async function cancelConnection() {
    const w = waiting.current;
    if (!w) return;
    try {
      await fetch(`/api/connectors/${w.id}/cancel`, { method: "POST" });
    } catch {}
    popup.current?.close();
    waiting.current = null;
    setBusy(null);
    setNotice("Connexion annulée.");
  }
  async function remove(app: App) {
    setBusy(app.id);
    try {
      const r = await fetch(`/api/connectors/${app.id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Déconnexion impossible.");
      setNotice(data.notice);
      setApps((all) =>
        all.map((a) =>
          a.id === app.id ? { ...a, status: "disconnected" } : a,
        ),
      );
      setDisconnect(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Déconnexion impossible.");
    } finally {
      setBusy(null);
    }
  }
  const filtered = apps.filter(
    (a) =>
      (category === "Toutes" || a.category === category) &&
      `${a.name} ${a.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Modal title="Applications" onClose={onClose} wide>
      <p className="muted">Vos outils, au fil de la conversation.</p>
      <p className="field-note">
        {connected
          ? "Connectez vos comptes personnels ou professionnels. L’IA peut lire les données autorisées ; chaque modification nécessite votre confirmation."
          : "Démonstration simulée : aucune application n’est connectée et aucune donnée externe n’est consultée."}
      </p>
      <div className="apps-search">
        <Search size={17} />
        <input
          aria-label="Rechercher une application"
          placeholder="Rechercher une application"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="apps-categories" aria-label="Catégories d’applications">
        {["Toutes", "Bureautique", "Développement", "Communication"].map(
          (c) => (
            <button
              className="secondary-button"
              aria-pressed={category === c}
              key={c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ),
        )}
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && waiting.current && (
        <button className="text-button" onClick={() => void cancelConnection()}>
          Annuler la connexion
        </button>
      )}
      <div className="apps-list">
        {filtered.map((app) => (
          <section key={app.id} className="app-card">
            <div className="app-heading">
              <span className="tool-icon">
                {app.status === "connected" ? (
                  <Check size={18} />
                ) : (
                  <Box size={18} />
                )}
              </span>
              <div>
                <h3>{app.name}</h3>
                <small>
                  {app.category} ·{" "}
                  {app.status === "connected"
                    ? `Connectée · ${app.toolCount} outils`
                    : app.status === "reconnect"
                      ? "À reconnecter"
                      : !connected
                        ? "Aperçu simulé"
                        : app.configured
                          ? "Disponible"
                          : "Configuration requise"}
                </small>
              </div>
            </div>
            <p>{app.description}</p>
            <details>
              <summary>Autorisations et fonctionnement</summary>
              <ul>
                {app.permissions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {connected && !app.configured && (
                <p>
                  La configuration OAuth initiale se fait côté serveur.
                  Consultez le guide fourni avec le projet ; aucun jeton n’est
                  demandé ici.
                </p>
              )}
            </details>
            {disconnect === app.id ? (
              <div className="form-actions">
                <span>Retirer l’accès local à cette application ?</span>
                <button
                  className="secondary-button"
                  onClick={() => setDisconnect(null)}
                >
                  Annuler
                </button>
                <button
                  className="accent-button"
                  disabled={!!busy}
                  onClick={() => void remove(app)}
                >
                  Confirmer la déconnexion
                </button>
              </div>
            ) : (
              <div className="app-actions">
                {app.status === "connected" ? (
                  <button
                    className="secondary-button"
                    disabled={!!busy}
                    onClick={() => setDisconnect(app.id)}
                  >
                    Déconnecter
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    disabled={!connected || !app.configured || !!busy}
                    onClick={() => void connect(app)}
                  >
                    {busy === app.id
                      ? "Connexion en cours…"
                      : app.status === "reconnect"
                        ? "Reconnecter"
                        : "Connecter"}
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
      {!filtered.length && (
        <p className="field-note">
          {apps.length
            ? "Aucune application ne correspond."
            : "Chargement des applications…"}
        </p>
      )}
    </Modal>
  );
}
