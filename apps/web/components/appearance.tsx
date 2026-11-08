"use client";
import { Monitor, Moon, Sun, Check, RotateCcw } from "lucide-react";
import { type Preferences, type Theme, type Font, defaultPreferences } from "../lib/domain";
import { Modal } from "./modal";
const themes = [{ id: "light", label: "Clair", icon: Sun }, { id: "dark", label: "Sombre", icon: Moon }, { id: "system", label: "Automatique", icon: Monitor }] as const;
const accents = [{ value: null, label: "Aucune" }, { value: "#8faacf", label: "Bleu ardoise" }, { value: "#99b6a0", label: "Sauge" }, { value: "#c4a0a6", label: "Rose poudré" }, { value: "#b6a2cc", label: "Lavande" }, { value: "#c9b288", label: "Sable" }];
export function Appearance({ preferences: p, onChange, onClose }: { preferences: Preferences; onChange: (value: Preferences) => void; onClose: () => void }) {
  function update(value: Partial<Preferences>) { onChange({ ...p, ...value }); }
  return <Modal title="Apparence" onClose={onClose} wide>
    <p className="muted settings-intro">Un espace qui vous ressemble. Les changements s’appliquent immédiatement.</p>
    <section className="setting-group"><div className="setting-heading"><h3>Thème</h3><span className="muted">À votre rythme</span></div>
      <div className="theme-options" role="group" aria-label="Thème">
        {themes.map(t => <button key={t.id} aria-pressed={p.theme === t.id} className={`theme-option ${p.theme === t.id ? "selected" : ""}`} onClick={() => update({ theme: t.id as Theme })}>
          <div className={`theme-mini ${t.id}`}><div className="mini-nav" /><div className="mini-content"><i /><i /><i /><div /></div></div>
          <span><t.icon size={15} />{t.label}{p.theme === t.id && <Check size={14} className="theme-check" />}</span>
        </button>)}
      </div>
    </section>
    <section className="setting-group"><label className="setting-heading" htmlFor="font-choice"><h3>Police d’écriture</h3><span className="muted">Interface et conversations</span></label>
      <select id="font-choice" value={p.font} onChange={e => update({ font: e.target.value as Font })}>
        <option value="times">Times New Roman</option><option value="georgia">Georgia</option><option value="arial">Arial</option><option value="system">Police du système</option>
      </select><p className="field-note">La police serif de votre appareil prend le relais si Times New Roman est indisponible.</p>
    </section>
    <section className="setting-group"><div className="setting-heading"><h3>Couleur d’accentuation</h3><span className="muted">Facultative</span></div>
      <div className="swatches" role="group" aria-label="Couleur d’accentuation">{accents.map(a => <button className={`swatch ${p.accent === a.value ? "chosen" : ""}`} key={a.label} title={a.label} aria-label={`Accentuation : ${a.label}`} aria-pressed={p.accent === a.value} onClick={() => update({ accent: a.value })}>
        <span style={a.value ? { background: a.value, color: "#171717" } : {}} className={a.value ? "" : "no-accent"}>{p.accent === a.value ? <Check size={17} /> : !a.value ? "∅" : null}</span><small>{a.label.split(" ")[0]}</small>
      </button>)}<label className="swatch custom-swatch"><input aria-label="Couleur personnalisée" type="color" value={p.accent || "#8faacf"} onChange={e => update({ accent: e.target.value })} /><small>Personnalisée</small></label></div>
      <p className="field-note">Sans accentuation, seul le contraste souligne les états actifs.</p>
    </section>
    <section className="appearance-preview" aria-label="Aperçu de l’apparence"><span className="eyebrow">VOTRE ESPACE, EN APERÇU</span><h3>Place à vos idées.</h3><p>Une question, une intuition, un nouveau chapitre.</p><button className="accent-button" onClick={onClose}>Retrouver ma conversation <span aria-hidden>↗</span></button></section>
    <footer className="settings-footer"><span className="muted">Enregistré automatiquement sur cet appareil</span><button className="text-button" onClick={() => onChange({ ...defaultPreferences, userId: p.userId })}><RotateCcw size={14} />Réinitialiser</button></footer>
  </Modal>;
}
