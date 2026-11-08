"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AppData, type Preferences, defaultPreferences, initialData, USER_ID } from "./domain";
import { DATA_KEY, PREFS_KEY, applyPreferences, parseData, parsePreferences } from "./storage";
export function useWorkspace(userId = USER_ID) {
  const dataKey = userId === USER_ID ? DATA_KEY : `${DATA_KEY}:${userId}`;
  const prefsKey = userId === USER_ID ? PREFS_KEY : `${PREFS_KEY}:${userId}`;
  const [data, setData] = useState<AppData>(() => initialData(userId));
  const [preferences, setPreferences] = useState<Preferences>({ ...defaultPreferences, userId });
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [corrupt, setCorrupt] = useState(false);
  const current = useRef(data);
  current.current = data;
  useEffect(() => {
    try { setPreferences(parsePreferences(localStorage.getItem(prefsKey), userId)); } catch { setStorageError("Le stockage local est indisponible. Vos changements restent dans cette session."); }
    try { setData(parseData(localStorage.getItem(dataKey), userId)); }
    catch { setCorrupt(true); setStorageError("La sauvegarde locale est illisible. Elle est conservée ; la démonstration fonctionne en mémoire."); }
    setReady(true);
  }, []);
  const save = useCallback(() => {
    if (!ready || corrupt) return;
    try { localStorage.setItem(dataKey, JSON.stringify(current.current)); }
    catch { setStorageError("Impossible d’enregistrer les données. Libérez de l’espace dans la bibliothèque ; les changements restent en mémoire."); }
  }, [ready, corrupt, dataKey]);
  useEffect(() => { const timer = setTimeout(save, 200); return () => clearTimeout(timer); }, [data, save]);
  useEffect(() => { window.addEventListener("pagehide", save); return () => window.removeEventListener("pagehide", save); }, [save]);
  useEffect(() => {
    if (!ready) return;
    applyPreferences(preferences);
    try { localStorage.setItem(prefsKey, JSON.stringify(preferences)); }
    catch { setStorageError("Vos préférences s’appliquent mais ne peuvent pas être enregistrées dans ce navigateur."); }
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyPreferences(preferences);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences, ready, prefsKey]);
  function resetCorrupt() {
    try { localStorage.removeItem(dataKey); setCorrupt(false); setStorageError(""); }
    catch { setStorageError("Le stockage local reste indisponible."); }
  }
  return { data, setData, preferences, setPreferences, ready, storageError, corrupt, resetCorrupt };
}
