"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
    (dialog.querySelector<HTMLElement>("[data-autofocus]") || dialog.querySelector<HTMLElement>(selector))?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); close.current(); }
      if (e.key === "Tab") {
        const items = [...dialog.querySelectorAll<HTMLElement>(selector)].filter(el => el.getClientRects().length);
        if (!items.length) { e.preventDefault(); dialog.focus(); return; }
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} tabIndex={-1}>
      <header className="modal-header"><div><span className="eyebrow">FRANCESTUDENT WEB</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" aria-label="Fermer la fenêtre" onClick={onClose}><X size={19} /></button></header>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}
