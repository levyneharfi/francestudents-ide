"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Copy, FileText, Folder, Globe, Library, Menu, MoreHorizontal, PanelLeft, PanelRight, Paperclip, Pencil, Plus, Search, Settings, SlidersHorizontal, Square, Star, Trash2, X, RotateCcw, BookOpen, Box, ArrowLeft, MessageSquare } from "lucide-react";
import { type Conversation, type Document, type Message, USER_ID, id, newConversation } from "../lib/domain";
import { readDocument } from "../lib/storage";
import { RemoteProvider } from "../lib/remote-provider";
import type { AIModel } from "../../../packages/francestudent-client/src/contracts";
import { models, MockProvider } from "../lib/mock-provider";
import { useWorkspace } from "../lib/use-workspace";
import { Appearance } from "./appearance";
import { Modal } from "./modal";

type Dialog = { kind: "appearance" | "library" | "project" | "rename" | "delete" | "document" | "tools" | "reset"; id?: string } | null;
const connected = process.env.NEXT_PUBLIC_FS_CONNECTED === "true";
const provider = connected ? new RemoteProvider() : new MockProvider();

function IconButton({ label, onClick, children, className = "", disabled = false, expanded }: { label: string; onClick: () => void; children: ReactNode; className?: string; disabled?: boolean; expanded?: boolean }) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} aria-expanded={expanded} onClick={onClick} disabled={disabled}>{children}</button>;
}

/** Modal drawer keyboard boundary; desktop panels remain regular landmarks. */
function Panel({ side, mobile, title, onClose, children }: { side: "left" | "right"; mobile: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement as HTMLElement;
    const panel = ref.current!;
    panel.querySelector<HTMLElement>("button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key === "Tab") {
        const items = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,[tabindex="0"]')].filter(x => x.getClientRects().length);
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus(); };
  }, [mobile]);
  return <>{mobile && <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />}<aside className={`side-panel ${side}-panel ${mobile ? "drawer" : ""}`} role={mobile ? "dialog" : "complementary"} aria-modal={mobile ? "true" : undefined} aria-label={title} ref={ref}>{children}</aside></>;
}

export function Workspace({ userId = USER_ID, onLogout }: { userId?: string; onLogout?: () => Promise<void> } = {}) {
  const [availableModels, setAvailableModels] = useState<readonly AIModel[]>(connected ? [] : models);
  const modelName = (modelId: string) => availableModels.find(m => m.id === modelId)?.name || `Modèle ${modelId}`;
  const makeConversation = (projectId: string | null = null, modelId = active?.modelId || availableModels[0]?.id || "") => newConversation(projectId, modelId, userId);
  const { data, setData, preferences, setPreferences, ready, storageError, corrupt, resetCorrupt } = useWorkspace(userId);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [contextTab, setContextTab] = useState<"context" | "tools">("context");
  const [editTitle, setEditTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectInstructions, setProjectInstructions] = useState("");
  const [importing, setImporting] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const active = data.conversations.find(c => c.id === data.activeId);
  const project = data.projects.find(p => p.id === active?.projectId);
  const documents = data.documents.filter(d => !d.projectId || d.projectId === active?.projectId);
  const selectedDocument = data.documents.find(d => d.id === dialog?.id);
  const selectedConversation = data.conversations.find(c => c.id === dialog?.id);
  const modalOpen = !!dialog;

  useEffect(() => {
    if (connected) Promise.resolve(provider.listModels()).then(setAvailableModels).catch(e => setNotice(e instanceof Error ? e.message : "Modèles indisponibles."));
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    function resize() { setMobile(media.matches); setLeft(!media.matches); setRight(window.innerWidth >= 1200); }
    resize(); media.addEventListener("change", resize);
    return () => { media.removeEventListener("change", resize); controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [active?.messages, data.activeId]);
  useEffect(() => { follow.current = true; }, [data.activeId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !modalOpen) {
        e.preventDefault(); setLeft(true); if (mobile) setRight(false); setTimeout(() => searchRef.current?.focus(), 30);
      }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [mobile, modalOpen]);

  function changeConversation(conversationId: string, fn: (c: Conversation) => Conversation) {
    setData(d => ({ ...d, conversations: d.conversations.map(c => c.id === conversationId ? fn(c) : c) }));
  }
  function selectConversation(conversationId: string) {
    setData(d => ({ ...d, activeId: conversationId })); setDraft(""); follow.current = true;
    if (mobile) setLeft(false);
  }
  function createConversation(projectId: string | null = null) {
    controller.current?.abort();
    const c = makeConversation(projectId);
    setData(d => ({ ...d, activeId: c.id, conversations: [c, ...d.conversations] }));
    setDraft(""); setFilter("all"); setQuery(""); if (mobile) setLeft(false);
    requestAnimationFrame(() => textarea.current?.focus());
  }
  function openDialog(value: NonNullable<Dialog>) {
    if (mobile) { setLeft(false); setRight(false); }
    if (value.kind === "rename") setEditTitle(data.conversations.find(c => c.id === value.id)?.title || "");
    if (value.kind === "project") { setProjectName(""); setProjectInstructions(""); }
    setDialog(value);
  }
  async function generate(c: Conversation, input?: string, retryId?: string) {
    if (controller.current) return;
    if (connected && retryId) setNotice("Nouvelle tentative dans une nouvelle conversation FranceStudent, avec le même historique local.");
    const nextController = new AbortController(); controller.current = nextController;
    const assistant: Message = { id: retryId || id(), userId, role: "assistant", modelId: c.modelId, content: "", status: "streaming" };
    const history = retryId ? c.messages.slice(0, c.messages.findIndex(m => m.id === retryId)) : [...c.messages, { id: id(), userId, role: "user" as const, content: input || "", status: "complete" as const }];
    const next = { ...c, title: c.messages.length ? c.title : (input || "Nouvelle conversation").slice(0, 70), updatedAt: new Date().toISOString(), messages: [...history, assistant] };
    setData(d => ({ ...d, activeId: next.id, conversations: d.conversations.some(x => x.id === next.id) ? d.conversations.map(x => x.id === next.id ? next : x) : [next, ...d.conversations] }));
    setBusy(c.id); setDraft(""); follow.current = true;
    const updateMessage = (fn: (m: Message) => Message) => changeConversation(c.id, conversation => ({ ...conversation, messages: conversation.messages.map(m => m.id === assistant.id ? fn(m) : m) }));
    try {
      for await (const chunk of provider.stream({
        userId, conversationId: c.id, modelId: c.modelId,
        messages: history.map(m => ({ role: m.role, content: m.content })),
        projectInstructions: data.projects.find(p => p.id === c.projectId)?.instructions,
        documents: data.documents.filter(f => !f.projectId || f.projectId === c.projectId).map(f => ({ name: f.name, content: f.content })),
        webSearch: data.webSearch,
        ...(connected ? { fresh: !!retryId } : {})
      }, { signal: nextController.signal })) updateMessage(m => ({ ...m, content: m.content + chunk }));
      updateMessage(m => ({ ...m, status: "complete" }));
    } catch (error) {
      const aborted = nextController.signal.aborted;
      updateMessage(m => ({ ...m, status: aborted ? "stopped" : "error" }));
      if (!aborted) setNotice(error instanceof Error ? error.message : "La réponse n’a pas pu aboutir. Réessayez.");
    } finally { if (controller.current === nextController) { controller.current = null; setBusy(null); } }
  }
  function send() {
    if (!draft.trim() || busy || !ready || !availableModels.length) return;
    if (draft.trim().length > 12000) { setNotice("Votre message dépasse 12 000 caractères. Raccourcissez-le avant l’envoi."); return; }
    void generate(active || makeConversation(), draft.trim());
  }
  async function importFile(file?: File) {
    if (!file || importing) return;
    setImporting(true);
    try {
      const value = await readDocument(file, data.documents.reduce((total, d) => total + d.size, 0));
      const doc: Document = { ...value, id: id(), userId, projectId: active?.projectId || null };
      setData(d => ({ ...d, documents: [...d.documents, doc] })); setNotice(`« ${file.name} » est ajouté à votre bibliothèque locale.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Import impossible."); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  const conversations = [...data.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter(c => (filter !== "favorites" || c.favorite) && (!query.trim() || `${c.title} ${c.messages.map(m => m.content).join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())));

  const tools = <div className="tools-content">
    <div className="tool-row"><span className="tool-icon"><Globe size={18} /></span><div><strong>Recherche web</strong><p>{connected ? "Recherche par FranceStudent" : "Simulation · aucune requête externe"}</p></div><button className={`switch ${data.webSearch ? "on" : ""}`} role="switch" aria-checked={data.webSearch} aria-label={connected ? "Recherche web FranceStudent" : "Recherche web simulée"} onClick={() => setData(d => ({ ...d, webSearch: !d.webSearch }))}><span /></button></div>
    <div className="tool-row"><span className="tool-icon"><FileText size={18} /></span><div><strong>Documents locaux</strong><p>Texte et Markdown · disponibles</p></div><Check size={15} className="muted" /></div>
    <div className="tool-row"><span className="tool-icon"><Box size={18} /></span><div><strong>Intégrations MCP</strong><p>À venir</p></div><span className="pill">Bientôt</span></div>
    <p className="field-note">{connected ? "La recherche est effectuée par FranceStudent. Le texte des documents du contexte est transmis lors de l’envoi du message." : "Les outils de cette démonstration n’accèdent ni à Internet ni aux fichiers de votre appareil sans sélection explicite."}</p>
  </div>;

  return <>
    <div className={`workspace ${left && !mobile ? "has-left" : ""} ${right && !mobile ? "has-right" : ""}`} inert={modalOpen}>
      {left && <Panel side="left" mobile={mobile} title="Navigation" onClose={() => setLeft(false)}>
        <div className="brand-row"><a href="#main" className="brand" onClick={() => mobile && setLeft(false)}><span className="brand-mark">f<span>.</span></span><span>FranceStudent<span className="brand-web">WEB</span></span></a><IconButton label="Replier la navigation" onClick={() => setLeft(false)}><PanelLeft size={18} /></IconButton></div>
        <button className="new-chat" onClick={() => createConversation()}><Plus size={18} />Nouvelle conversation<span className="shortcut" aria-hidden="true">↗</span></button>
        <div className="search-box"><Search size={16} /><input ref={searchRef} aria-label="Rechercher des conversations" placeholder="Rechercher" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></div>
        <nav className="primary-nav" aria-label="Espace personnel">
          <button onClick={() => openDialog({ kind: "library" })}><Library size={18} />Bibliothèque<span className="nav-count">{data.documents.length}</span></button>
          <button className={filter === "favorites" ? "active-nav" : ""} aria-pressed={filter === "favorites"} onClick={() => setFilter(v => v === "all" ? "favorites" : "all")}><Star size={18} />Favoris<span className="nav-count">{data.conversations.filter(c => c.favorite).length || ""}</span></button>
        </nav>
        <div className="nav-section projects-section"><div className="section-label"><span>PROJETS</span><IconButton label="Créer un projet" onClick={() => openDialog({ kind: "project" })}><Plus size={15} /></IconButton></div>
          {data.projects.map(p => <button className={`project-item ${project?.id === p.id ? "selected-project" : ""}`} key={p.id} onClick={() => { const c = data.conversations.find(c => c.projectId === p.id); if (c) selectConversation(c.id); else createConversation(p.id); }}><Folder size={17} /><span>{p.name}</span><ChevronDown size={13} /></button>)}
        </div>
        <div className="nav-section history-section"><div className="section-label"><span>{query ? "RÉSULTATS" : filter === "favorites" ? "CONVERSATIONS FAVORITES" : "CONVERSATIONS"}</span><span>{conversations.length}</span></div>
          <div className="conversation-list">{conversations.map(c => <div key={c.id} className={`conversation-item ${c.id === active?.id ? "current" : ""}`}>
            <button className="conversation-title" aria-current={c.id === active?.id ? "page" : undefined} onClick={() => selectConversation(c.id)}>{c.favorite && <Star size={12} fill="currentColor" />}<span>{c.title}</span></button>
            <IconButton label={`Renommer ${c.title}`} onClick={() => openDialog({ kind: "rename", id: c.id })}><MoreHorizontal size={16} /></IconButton>
          </div>)}{!conversations.length && <p className="empty-small">{query ? "Aucune conversation ne correspond à votre recherche." : "Vos conversations apparaîtront ici."}</p>}</div>
        </div>
        <div className="sidebar-bottom"><button className="settings-nav" onClick={() => openDialog({ kind: "appearance" })}><Settings size={18} />Paramètres<span>Apparence</span></button>{onLogout && <button className="settings-nav" onClick={() => { controller.current?.abort(); void onLogout().catch(() => setNotice("Déconnexion impossible. Réessayez.")); }}>Déconnexion locale</button>}<div className="profile"><div className="avatar">L</div><div><strong>Espace personnel</strong><span>Sur cet appareil</span></div><span className="profile-dot" title="Démonstration locale" /></div></div>
      </Panel>}

      <main id="main" className="main-panel" inert={mobile && (left || right)}>
        <header className="topbar"><div className="topbar-leading">{!left && <IconButton label="Ouvrir la navigation" expanded={left} onClick={() => { setLeft(true); if (mobile) setRight(false); }}><PanelLeft size={19} /></IconButton>}
          <div className="model-select-wrap"><select aria-label="Modèle de conversation" value={active?.modelId || availableModels[0]?.id || ""} disabled={!!busy || !availableModels.length} onChange={e => { const value = e.target.value; if (active) changeConversation(active.id, c => ({ ...c, modelId: value })); else { const c = makeConversation(null, value); setData(d => ({ ...d, activeId: c.id, conversations: [c, ...d.conversations] })); } }}>{!availableModels.length && <option value="">Modèles indisponibles</option>}{availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><ChevronDown size={14} /></div><span className="demo-badge"><span />{connected ? "FranceStudent" : "Démonstration"}</span>
        </div><div className="topbar-actions">{active && <IconButton label={active.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => changeConversation(active.id, c => ({ ...c, favorite: !c.favorite }))}><Star size={18} fill={active.favorite ? "currentColor" : "none"} /></IconButton>}{!right && <IconButton label="Ouvrir le contexte" expanded={right} onClick={() => { setRight(true); if (mobile) setLeft(false); }}><PanelRight size={19} /></IconButton>}</div></header>
        {(notice || storageError) && <div className="notice" role="status"><span>{notice || storageError}</span>{notice ? <IconButton label="Fermer la notification" onClick={() => setNotice("")}><X size={14} /></IconButton> : corrupt ? <button className="text-button" onClick={() => openDialog({ kind: "reset" })}>Réinitialiser</button> : null}</div>}
        <div className="conversation-heading"><span><Folder size={13} />{project?.name || "Espace personnel"}<span className="breadcrumb-slash">/</span><span className="heading-title">{active?.title || "Nouvelle conversation"}</span></span>{active && <div><IconButton label="Renommer la conversation" onClick={() => openDialog({ kind: "rename", id: active.id })}><Pencil size={14} /></IconButton><IconButton label="Supprimer la conversation" onClick={() => openDialog({ kind: "delete", id: active.id })}><Trash2 size={14} /></IconButton></div>}</div>
        <div className="message-scroller" ref={scroller} onScroll={() => { const el = scroller.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 110; }}>
          {!active?.messages.length ? <div className="welcome"><span className="welcome-symbol">f.</span><span className="eyebrow">VOTRE ESPACE DE RÉFLEXION</span><h1>Une idée.<br />Et tout commence.</h1><p>Explorez une question, donnez forme à vos pensées.<br />Cet espace est le vôtre.</p><div className="suggestions">{["Construire un plan", "Explorer une idée", "Organiser mes notes"].map((text, i) => <button key={text} onClick={() => { setDraft(["Aide-moi à construire un plan pour mon mémoire.", "Comment explorer une nouvelle idée ?", "Aide-moi à organiser mes notes."][i]); textarea.current?.focus(); }}>{text}<ArrowUpRight size={15} /></button>)}</div></div> : <div className="messages" aria-label="Messages de la conversation">{active.messages.map((message, index) => <article key={message.id} className={`message ${message.role}`} aria-label={message.role === "user" ? "Message envoyé" : connected ? "Réponse FranceStudent" : "Réponse simulée"}>
            <div className={`message-avatar ${message.role === "assistant" ? "assistant-avatar" : ""}`}>{message.role === "user" ? "L" : "f."}</div>
            <div className="message-content"><div className="message-byline"><strong>{message.role === "user" ? "Vous" : modelName(message.modelId || active.modelId)}</strong>{message.role === "assistant" && <span>{connected ? "FRANCESTUDENT" : "SIMULATION"}</span>}</div><div className="message-text">{message.content ? message.content.split("\n\n").map((paragraph, n) => <p key={n}>{paragraph}</p>) : message.status === "streaming" ? <span className="thinking"><i /><i /><i /><span className="sr-only">Réponse en cours</span></span> : <p className="muted">La réponse a été arrêtée.</p>}{message.status === "streaming" && message.content && <span className="stream-cursor" />}</div>
            {message.role === "assistant" && message.status !== "streaming" && <div className="message-actions"><IconButton label="Copier la réponse" onClick={() => { navigator.clipboard.writeText(message.content).then(() => setNotice("Réponse copiée.")).catch(() => setNotice("La copie n’est pas disponible dans ce navigateur.")); }}><Copy size={14} /></IconButton>{message.status === "stopped" && <span className="muted">Réponse arrêtée</span>}{message.status === "error" && <span className="muted">Réponse interrompue</span>}{index === active.messages.length - 1 && ["error", "stopped"].includes(message.status) && <button className="text-button" disabled={!!busy} onClick={() => void generate(active, undefined, message.id)}><RotateCcw size={13} />Réessayer</button>}</div>}</div>
          </article>)}</div>}
        </div>
        <div className="composer-area"><form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
          <textarea ref={textarea} aria-label="Votre message" placeholder="Écrivez votre message…" value={draft} rows={2} maxLength={12000} onChange={e => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <div className="composer-toolbar"><div><IconButton label="Joindre un document texte" disabled={importing} onClick={() => fileRef.current?.click()}><Paperclip size={19} /></IconButton><button className="composer-tools" type="button" onClick={() => openDialog({ kind: "tools" })}><SlidersHorizontal size={16} /><span>Outils</span></button>{data.webSearch && <span className="web-indicator"><Globe size={13} />{connected ? "Recherche web" : "Simulation web"}</span>}</div>{busy ? <button className="send-button" type="button" aria-label="Arrêter la réponse" title="Arrêter la réponse" onClick={() => controller.current?.abort()}><Square size={15} fill="currentColor" /></button> : <button className="send-button" type="submit" aria-label="Envoyer le message" disabled={!draft.trim() || !ready || !availableModels.length}><ArrowUp size={21} /></button>}</div>
        </form><p className="composer-caption">Un espace privé. {connected ? "Connecté à FranceStudent." : "Des réponses simulées."}<span>Entrée pour envoyer · ⇧ Entrée pour un saut de ligne</span></p></div>
      </main>

      {right && <Panel side="right" mobile={mobile} title="Contexte de la conversation" onClose={() => setRight(false)}>
        <header className="context-header"><h2>Contexte</h2><IconButton label="Replier le contexte" onClick={() => setRight(false)}><PanelRight size={18} /></IconButton></header>
        <div className="context-tabs" role="tablist" aria-label="Panneau de contexte"><button role="tab" aria-selected={contextTab === "context"} aria-controls="context-panel" id="context-tab" onClick={() => setContextTab("context")}>Vue d’ensemble</button><button role="tab" aria-selected={contextTab === "tools"} aria-controls="tools-panel" id="tools-tab" onClick={() => setContextTab("tools")}>Outils</button></div>
        <div className="context-body">{contextTab === "tools" ? <div role="tabpanel" id="tools-panel" aria-labelledby="tools-tab">{tools}</div> : <div role="tabpanel" id="context-panel" aria-labelledby="context-tab">
          <section className="context-section"><div className="section-label"><span>PROJET</span><Folder size={14} /></div><select aria-label="Projet de la conversation" value={active?.projectId || ""} disabled={!!busy} onChange={e => { const projectId = e.target.value || null; if (active) changeConversation(active.id, c => ({ ...c, projectId })); else createConversation(projectId); }}><option value="">Sans projet</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><p className="field-note">Un lieu pour vos idées et leurs références.</p></section>
          <section className="context-section"><label className="context-label" htmlFor="project-instructions">Instructions du projet <Pencil size={13} /></label>{project ? <><textarea id="project-instructions" className="instructions" value={project.instructions} placeholder="Comment souhaitez-vous être accompagné ?" maxLength={6000} disabled={!!busy} onChange={e => { const value = e.target.value; setData(d => ({ ...d, projects: d.projects.map(p => p.id === project.id ? { ...p, instructions: value } : p) })); }} /><span className="autosave-label"><Check size={11} />Enregistrées sur cet appareil</span></> : <p className="field-note">Choisissez un projet pour définir ses instructions.</p>}</section>
          <section className="context-section"><div className="section-label"><span>FICHIERS <span className="count">{documents.length}</span></span><IconButton label="Ajouter un document" disabled={importing} onClick={() => fileRef.current?.click()}><Plus size={15} /></IconButton></div><div className="context-files">{documents.map(doc => <button key={doc.id} className="file-item" onClick={() => openDialog({ kind: "document", id: doc.id })}><span className="file-icon"><FileText size={18} /></span><span><strong>{doc.name}</strong><small>{Math.max(1, Math.ceil(doc.size / 1024))} Ko · Local</small></span><ArrowUpRight size={13} /></button>)}{!documents.length && <p className="empty-small">Ajoutez vos premières notes au format .txt ou .md.</p>}</div><button className="library-link" onClick={() => openDialog({ kind: "library" })}>Ouvrir la bibliothèque<ArrowUpRight size={13} /></button></section>
          <section className="context-section compact-tool"><Globe size={17} /><div><strong>Recherche web</strong><span>{connected ? (data.webSearch ? "Activée sur FranceStudent" : "Désactivée") : (data.webSearch ? "Simulation activée" : "Simulation désactivée")}</span></div><button className={`switch ${data.webSearch ? "on" : ""}`} role="switch" aria-checked={data.webSearch} aria-label={connected ? "Recherche web FranceStudent" : "Recherche web simulée"} onClick={() => setData(d => ({ ...d, webSearch: !d.webSearch }))}><span /></button></section>
          <section className="context-section compact-tool"><Box size={17} /><div><strong>Intégrations MCP</strong><span>Un espace pour vos futurs outils</span></div><span className="pill">À venir</span></section>
          {connected && <p className="field-note">Le texte des fichiers du contexte sera transmis à FranceStudent lors de votre prochain envoi.</p>}
          <section className="memory-note"><BookOpen size={16} /><div><strong>Votre contexte, au même endroit.</strong><p>Les fichiers et instructions restent associés à votre espace local.</p></div></section>
        </div>}</div>
        <footer className="context-footer"><span className="local-dot" />Données conservées sur cet appareil</footer>
      </Panel>}
    </div>
    <input ref={fileRef} className="sr-only" tabIndex={-1} type="file" accept=".txt,.md,text/plain,text/markdown" aria-label="Importer un document" onChange={e => void importFile(e.target.files?.[0])} />
    <div className="sr-only" role="status" aria-live="polite">{busy ? "Réponse en cours" : "Prêt"}</div>
    {dialog?.kind === "appearance" && <Appearance preferences={preferences} onChange={setPreferences} onClose={() => setDialog(null)} />}
    {dialog?.kind === "tools" && <Modal title="Vos outils" onClose={() => setDialog(null)}>{tools}</Modal>}
    {dialog?.kind === "project" && <Modal title="Nouveau projet" onClose={() => setDialog(null)}><form className="stack-form" onSubmit={e => { e.preventDefault(); if (!projectName.trim()) return; const p = { id: id(), userId, name: projectName.trim(), instructions: projectInstructions.trim() }; const c = makeConversation(p.id); setData(d => ({ ...d, projects: [...d.projects, p], activeId: c.id, conversations: [c, ...d.conversations] })); setDialog(null); }}><p className="muted">Rassemblez vos conversations autour d’une même idée.</p><label>Nom du projet<input data-autofocus required maxLength={80} placeholder="Un nouveau chapitre…" value={projectName} onChange={e => setProjectName(e.target.value)} /></label><label>Instructions personnalisées<textarea maxLength={6000} rows={4} placeholder="Précisez l’objectif, le style ou les contraintes du projet." value={projectInstructions} onChange={e => setProjectInstructions(e.target.value)} /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Annuler</button><button className="accent-button" disabled={!projectName.trim()}>Créer le projet</button></div></form></Modal>}
    {dialog?.kind === "rename" && selectedConversation && <Modal title="Renommer la conversation" onClose={() => setDialog(null)}><form className="stack-form" onSubmit={e => { e.preventDefault(); if (!editTitle.trim()) return; changeConversation(selectedConversation.id, c => ({ ...c, title: editTitle.trim() })); setDialog(null); }}><label>Titre<input data-autofocus value={editTitle} maxLength={100} required onChange={e => setEditTitle(e.target.value)} /></label><div className="form-actions"><button className="secondary-button" type="button" onClick={() => openDialog({ kind: "delete", id: selectedConversation.id })}><Trash2 size={14} />Supprimer</button><button className="accent-button" disabled={!editTitle.trim()}>Enregistrer</button></div></form></Modal>}
    {dialog?.kind === "delete" && selectedConversation && <Modal title="Supprimer cette conversation ?" onClose={() => setDialog(null)}><p className="muted">« {selectedConversation.title} » sera supprimée de cet appareil. Cette action est définitive.</p><div className="form-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Annuler</button><button className="accent-button" onClick={() => { if (busy === selectedConversation.id) controller.current?.abort(); setData(d => { const conversations = d.conversations.filter(c => c.id !== selectedConversation.id); return { ...d, conversations, activeId: d.activeId === selectedConversation.id ? conversations[0]?.id || null : d.activeId }; }); setDialog(null); }}>Supprimer la conversation</button></div></Modal>}
    {dialog?.kind === "reset" && <Modal title="Réinitialiser la sauvegarde locale ?" onClose={() => setDialog(null)}><p className="muted">La sauvegarde illisible sera remplacée par la session actuellement affichée. Cette action est définitive.</p><div className="form-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Annuler</button><button className="accent-button" onClick={() => { resetCorrupt(); setDialog(null); }}>Réinitialiser</button></div></Modal>}
    {dialog?.kind === "library" && <Modal title="Bibliothèque" onClose={() => setDialog(null)} wide><div className="library-intro"><p className="muted">Vos références, toujours à portée de main.</p><button className="accent-button" disabled={importing} onClick={() => fileRef.current?.click()}><Plus size={16} />Importer</button></div><p className="field-note">Fichiers .txt et .md · 256 Ko par fichier · 1 Mo au total · stockage sur cet appareil uniquement</p><div className="library-list">{data.documents.map(doc => <div className="library-row" key={doc.id}><button onClick={() => setDialog({ kind: "document", id: doc.id })}><span className="file-icon"><FileText size={20} /></span><span><strong>{doc.name}</strong><small>{data.projects.find(p => p.id === doc.projectId)?.name || "Espace personnel"} · {Math.max(1, Math.ceil(doc.size / 1024))} Ko</small></span></button><IconButton label={`Lire ${doc.name}`} onClick={() => setDialog({ kind: "document", id: doc.id })}><ArrowUpRight size={16} /></IconButton></div>)}{!data.documents.length && <div className="library-empty"><FileText size={32} /><h3>Votre bibliothèque commence ici.</h3><p>Ajoutez un document texte pour le retrouver dans votre contexte.</p></div>}</div></Modal>}
    {dialog?.kind === "document" && selectedDocument && <Modal title={selectedDocument.name} onClose={() => setDialog(null)} wide><div className="document-toolbar"><button className="text-button" onClick={() => setDialog({ kind: "library" })}><ArrowLeft size={14} />Bibliothèque</button><span className="pill">Document local · texte brut</span></div><pre className="document-content">{selectedDocument.content || "Ce document est vide."}</pre><div className="document-project"><label htmlFor="document-project">Associer à un projet</label><select id="document-project" value={selectedDocument.projectId || ""} onChange={e => { const projectId = e.target.value || null; setData(d => ({ ...d, documents: d.documents.map(doc => doc.id === selectedDocument.id ? { ...doc, projectId } : doc) })); }}><option value="">Espace personnel</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="form-actions"><button className="secondary-button" onClick={() => { setData(d => ({ ...d, documents: d.documents.filter(doc => doc.id !== selectedDocument.id) })); setDialog({ kind: "library" }); }}><Trash2 size={15} />Retirer ce document</button><button className="accent-button" onClick={() => setDialog(null)}>Terminé</button></div></Modal>}
  </>;
}
