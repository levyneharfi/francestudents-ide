"use client";
import { memo, useState } from "react";
import dynamic from "next/dynamic";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Message } from "../../lib/domain";
import {
  safeURL,
  validBlock,
  type ReplyBlock,
  type WidgetState,
  type ToolOperation,
} from "../../../../packages/francestudent-client/src/replies";
const Chart = dynamic(() => import("./chart"), {
  ssr: false,
  loading: () => <p>Chargement du graphique…</p>,
});
const Diagram = dynamic(() => import("./diagram"), {
  ssr: false,
  loading: () => <p>Chargement du schéma…</p>,
});
const plugins = [remarkGfm, remarkMath];
const katexOptions = [
  [
    rehypeKatex,
    {
      trust: false,
      strict: "ignore",
      throwOnError: false,
      maxExpand: 100,
      maxSize: 20,
    },
  ],
] as never;
function Code({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="reply-code">
      <button
        type="button"
        onClick={async (e) => {
          try {
            await navigator.clipboard.writeText(
              e.currentTarget.parentElement?.querySelector("pre")
                ?.textContent || "",
            );
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copié" : "Copier le code"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}
const Text = memo(function Text({ value }: { value: string }) {
  return (
    <Markdown
      skipHtml
      remarkPlugins={plugins}
      rehypePlugins={katexOptions}
      components={{
        pre: Code,
        a: ({ href, children }) =>
          safeURL(href) ? (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
        img: ({ alt }) => <span>{alt || "Image"}</span>,
        table: ({ children }) => (
          <div className="reply-table">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {value}
    </Markdown>
  );
});
function Block({
  block: b,
  state,
  onChange,
  onSubmit,
  disabled,
}: {
  block: ReplyBlock;
  state: WidgetState;
  onChange: (state: WidgetState) => void;
  onSubmit: (text: string) => void;
  disabled: boolean;
}) {
  let body: React.ReactNode;
  switch (b.kind) {
    case "card":
      body = (
        <>
          <p>{b.text}</p>
          {b.status && (
            <small>
              {b.status === "pending"
                ? "En attente"
                : b.status === "warning"
                  ? "À vérifier"
                  : "Information"}
            </small>
          )}
        </>
      );
      break;
    case "metrics":
      body = (
        <dl className="reply-metrics">
          {b.items.map((i, n) => (
            <div key={n}>
              <dt>{i.label}</dt>
              <dd>{i.value}</dd>
              {i.detail && <small>{i.detail}</small>}
            </div>
          ))}
        </dl>
      );
      break;
    case "progress":
      body = (
        <>
          <progress aria-label={b.label} value={b.value} max={b.max} />
          <p>
            {b.label} · {b.value}/{b.max}
          </p>
        </>
      );
      break;
    case "checklist": {
      const count = b.items.filter((i) => state[i.id] === true).length;
      body = (
        <>
          <div className="reply-check-count">
            {count}/{b.items.length}
          </div>
          <progress aria-label={b.title} value={count} max={b.items.length} />
          {b.items.map((i) => (
            <label className="reply-option" key={i.id}>
              <input
                type="checkbox"
                checked={state[i.id] === true}
                onChange={(e) =>
                  onChange({ ...state, [i.id]: e.target.checked })
                }
              />
              <span>{i.label}</span>
            </label>
          ))}
          <small>Validation manuelle · enregistrée sur cet appareil</small>
        </>
      );
      break;
    }
    case "form":
      body = (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (state._submitted === true) return;
            onChange({ ...state, _submitted: true });
            onSubmit(
              `${b.title}\n${b.fields.map((f) => `${f.label} : ${state[f.id]}`).join("\n")}`,
            );
          }}
        >
          {b.fields.map((f) => (
            <fieldset key={f.id}>
              <legend>{f.label}</legend>
              {f.options.map((option, n) => (
                <label className="reply-option" key={n}>
                  <input
                    type="radio"
                    required
                    name={`${b.id}-${f.id}`}
                    value={option}
                    checked={state[f.id] === option}
                    disabled={disabled || state._submitted === true}
                    onChange={() => onChange({ ...state, [f.id]: option })}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <button
            className="accent-button"
            disabled={
              disabled ||
              state._submitted === true ||
              !b.fields.every((f) => f.options.includes(String(state[f.id])))
            }
          >
            {state._submitted ? "Réponse envoyée" : b.submitLabel}
          </button>
        </form>
      );
      break;
    case "table":
      body = (
        <div
          className="reply-table"
          tabIndex={0}
          role="region"
          aria-label={b.title}
        >
          <table>
            <thead>
              <tr>
                {b.columns.map((c, n) => (
                  <th key={n}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, n) => (
                <tr key={n}>
                  {r.map((c, k) => (
                    <td key={k}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    case "chart":
      body = <Chart block={b} />;
      break;
    case "diagram":
      body = (
        <Diagram code={b.code} title={`${b.title}. ${b.description || ""}`} />
      );
      break;
  }
  return (
    <section className={`reply-block reply-${b.kind}`} aria-label={b.title}>
      <h3>{b.title}</h3>
      {b.description && <p className="muted">{b.description}</p>}
      {body}
    </section>
  );
}
export const RichMessage = memo(function RichMessage({
  message,
  onState,
  onSubmit,
  disabled,
}: {
  message: Message;
  onState: (blockId: string, state: WidgetState) => void;
  onSubmit: (text: string, blockId: string, state: WidgetState) => void;
  disabled: boolean;
}) {
  let offset = 0;
  const parts: React.ReactNode[] = [];
  for (const p of [...(message.blocks || [])].sort(
    (a, b) => a.offset - b.offset,
  )) {
    if (!validBlock(p.block)) continue;
    const end = Math.min(message.content.length, Math.max(offset, p.offset));
    if (end > offset)
      parts.push(
        <Text
          key={`text-${p.block.id}`}
          value={message.content.slice(offset, end)}
        />,
      );
    parts.push(
      <Block
        key={p.block.id}
        block={p.block}
        state={message.widgets?.[p.block.id] || {}}
        onChange={(state) => onState(p.block.id, state)}
        onSubmit={(text) =>
          onSubmit(text, p.block.id, {
            ...message.widgets?.[p.block.id],
            _submitted: true,
          })
        }
        disabled={disabled}
      />,
    );
    offset = end;
  }
  if (offset < message.content.length)
    parts.push(<Text key="tail" value={message.content.slice(offset)} />);
  return (
    <>
      {parts}
      {!!message.sources?.length && (
        <div className="reply-sources">
          <span>Sources consultées</span>
          {message.sources
            .filter((s) => safeURL(s.url))
            .map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {s.label}
              </a>
            ))}
        </div>
      )}
    </>
  );
});
const labels = {
  pending: "Confirmation requise",
  running: "Exécution en cours",
  succeeded: "Action exécutée",
  rejected: "Action refusée",
  failed: "Action échouée",
  uncertain: "Résultat incertain — vérifier dans l’application",
};
export function ToolCard({
  operation: op,
  onDecide,
  disabled,
}: {
  operation: ToolOperation;
  onDecide: (approved: boolean) => Promise<void>;
  disabled: boolean;
}) {
  const [working, setWorking] = useState(false);
  return (
    <section className="reply-block tool-card" aria-label={op.title}>
      <div className="eyebrow">
        {op.appId} · {labels[op.status]}
      </div>
      <h3>{op.title}</h3>
      <details open={op.status === "pending"}>
        <summary>Paramètres de l’action</summary>
        <pre>{JSON.stringify(op.arguments, null, 2)}</pre>
      </details>
      {op.summary && <p>{op.summary}</p>}
      {op.status === "pending" && (
        <div className="form-actions">
          <button
            className="secondary-button"
            disabled={disabled || working}
            onClick={async () => {
              setWorking(true);
              try {
                await onDecide(false);
              } finally {
                setWorking(false);
              }
            }}
          >
            Refuser
          </button>
          <button
            className="accent-button"
            disabled={disabled || working}
            onClick={async () => {
              setWorking(true);
              try {
                await onDecide(true);
              } finally {
                setWorking(false);
              }
            }}
          >
            Confirmer cette action
          </button>
        </div>
      )}
    </section>
  );
}
