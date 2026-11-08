"use client";
import { useEffect, useId, useRef, useState } from "react";
let rendering = Promise.resolve();
export default function ReplyDiagram({
  code,
  title,
}: {
  code: string;
  title: string;
}) {
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [appearance, setAppearance] = useState("");
  useEffect(() => {
    const update = () =>
      setAppearance(
        `${document.documentElement.dataset.theme}:${document.documentElement.dataset.font}`,
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-font"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    rendering = rendering
      .catch(() => {})
      .then(async () => {
        try {
          const [{ default: mermaid }, { default: DOMPurify }] =
            await Promise.all([import("mermaid"), import("dompurify")]);
          if (cancelled) return;
          const root = getComputedStyle(document.documentElement);
          const fontFamily = getComputedStyle(document.body).fontFamily;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            maxTextSize: 12000,
            maxEdges: 100,
            theme: "base",
            fontFamily,
            themeVariables: {
              primaryColor: root.getPropertyValue("--panel").trim(),
              primaryTextColor: root.getPropertyValue("--text").trim(),
              primaryBorderColor: root.getPropertyValue("--muted").trim(),
              lineColor: root.getPropertyValue("--muted").trim(),
              background: root.getPropertyValue("--bg").trim(),
            },
            flowchart: { htmlLabels: false },
          });
          await mermaid.parse(code);
          const { svg } = await mermaid.render(`diagram${id}`, code);
          if (!cancelled && ref.current)
            ref.current.innerHTML = DOMPurify.sanitize(svg, {
              USE_PROFILES: { svg: true },
              FORBID_TAGS: ["foreignObject", "script", "image", "a"],
              FORBID_ATTR: ["href", "xlink:href"],
            });
        } catch {
          if (!cancelled) setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, id, appearance]);
  return (
    <>
      <div className="reply-diagram" ref={ref} role="img" aria-label={title} />
      {failed && (
        <p>
          Le schéma ne peut pas être affiché. Sa description reste disponible
          ci-dessous.
        </p>
      )}
      <details>
        <summary>Description et structure du schéma</summary>
        <pre>{code}</pre>
      </details>
    </>
  );
}
