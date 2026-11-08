"use client";
import { useEffect, useState } from "react";
import { Workspace } from "./workspace";
import { applyPreferences, parsePreferences, PREFS_KEY } from "../lib/storage";
const connected = process.env.NEXT_PUBLIC_FS_CONNECTED === "true";
export function LocalConnection() {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(connected);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  function enter(userId: string) {
    try { applyPreferences(parsePreferences(localStorage.getItem(`${PREFS_KEY}:${userId}`), userId)); } catch {}
    setUserId(userId);
  }
  useEffect(() => {
    if (!connected) return;
    fetch("/api/session", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.authenticated) enter(d.userId); }).catch(() => setError("Le serveur local n’est pas accessible. Démarrez-le depuis le Terminal.")).finally(() => setLoading(false));
  }, []);
  if (!connected) return <Workspace />;
  if (userId) return <Workspace key={userId} userId={userId} onLogout={async () => {
    const response = await fetch("/api/session", { method: "DELETE" });
    if (response.ok) { setUserId(""); setPassword(""); }
  }} />;
  return <main className="connection-page"><div className="connection-card"><span className="welcome-symbol">f.</span><span className="eyebrow">FRANCESTUDENT WEB · SUR VOTRE MAC</span><h1>Votre espace privé.</h1><p className="muted">Connectez-vous avec le mot de passe local créé dans le Terminal.</p>{loading ? <p role="status">Vérification de votre session…</p> : <form className="stack-form" onSubmit={async e => {
    e.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await response.json(); setPassword("");
      if (!response.ok) throw new Error(data.error || "Connexion locale impossible.");
      enter(data.userId);
    } catch (e) { setError(e instanceof Error ? e.message : "Serveur local indisponible."); }
    finally { setPending(false); }
  }}><label>Mot de passe local<input aria-label="Mot de passe local" type="password" autoComplete="current-password" value={password} maxLength={256} required onChange={e => setPassword(e.target.value)} /></label>{error && <p role="alert" className="muted">{error}</p>}<button className="accent-button" disabled={pending || !password}>{pending ? "Connexion…" : "Ouvrir mon espace"}</button></form>}<p className="field-note">Vos identifiants FranceStudent se configurent uniquement dans le Terminal.</p></div></main>;
}
