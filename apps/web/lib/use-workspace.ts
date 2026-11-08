"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AppData, type Preferences, defaultPreferences, initialData } from "./domain";
import { DATA_KEY, PREFS_KEY, applyPreferences, parseData, parsePreferences } from "./storage";
export function useWorkspace() {
  const [data, setData] = useState<AppData>(initialData);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [corrupt, setCorrupt] = useState(false);
  const current = useRef(data);
  current.current = data;
  useEffect(() => {
    try { setPreferences(parsePreferences(localStorage.getItem(PREFS_KEY))); } catch { setStorageError("Le stockage local est indisponible. Vos changements restent dans cette session."); }
    try { setData(parseData(localStorage.getItem(DATA_KEY))); }
    catch { setCorrupt(true); setStorageError("La sauvegarde locale est illisible. Elle est conservée ; la démonstration fonctionne en mémoire."); }
    setReady(true);
  }, []);
  const save = useCallback(() => {
    if (!ready || corrupt) return;
    try { localStorage.setItem(DATA_KEY, JSON.stringify(current.current)); }
    catch { setStorageError("Impossible d’enregistrer les données. Libérez de l’espace dans la bibliothèque ; les changements restent en mémoire."); }
  }, [ready, corrupt]);
  useEffect(() => { const timer = setTimeout(save, 200); return () => clearTimeout(timer); }, [data, save]);
  useEffect(() => { window.addEventListener("pagehide", save); return () => window.removeEventListener("pagehide", save); }, [save]);
  useEffect(() => {
    if (!ready) return;
    applyPreferences(preferences);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)); }
    catch { setStorageError("Vos préférences s’appliquent mais ne peuvent pas être enregistrées dans ce navigateur."); }
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyPreferences(preferences);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences, ready]);
  function resetCorrupt() {
    try { localStorage.removeItem(DATA_KEY); setCorrupt(false); setStorageError(""); }
    catch { setStorageError("Le stockage local reste indisponible."); }
  }
  return { data, setData, preferences, setPreferences, ready, storageError, corrupt, resetCorrupt };
}
