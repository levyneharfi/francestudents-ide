import {
  validBlock,
  validCall,
  type ReplyBlock,
  type ToolCall,
} from "./replies";
/** Incremental framing. Fences split across arbitrary UTF-8 SSE deltas are buffered. */
export class ReplyParser {
  private buffer = "";
  private mode: "text" | "fs-ui" | "fs-tool" = "text";
  private seen = new Set<string>();
  constructor(
    private handlers: {
      text: (text: string) => void;
      block: (block: ReplyBlock) => void;
      call: (call: ToolCall) => void;
    },
    private rich: boolean,
    private tools: boolean,
  ) {}
  push(text: string) {
    this.buffer += text;
    while (this.buffer) {
      if (this.mode !== "text") {
        const end = this.buffer.indexOf("\n```");
        if (end < 0) {
          if (this.buffer.length > 64000) {
            this.handlers.text("\n[Composant trop volumineux]\n");
            this.buffer = "";
            this.mode = "text";
          }
          return;
        }
        const raw = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 4);
        try {
          const value = JSON.parse(raw);
          if (
            this.mode === "fs-ui" &&
            this.rich &&
            validBlock(value) &&
            !this.seen.has(value.id)
          ) {
            this.seen.add(value.id);
            this.handlers.block(value);
          } else if (this.mode === "fs-tool" && this.tools && validCall(value))
            this.handlers.call(value);
          else
            this.handlers.text(
              "\n[Composant non disponible : format invalide ou non pris en charge.]\n",
            );
        } catch {
          this.handlers.text(
            "\n[Composant non disponible : données incomplètes ou invalides.]\n",
          );
        }
        this.mode = "text";
      } else {
        const match = /```(fs-ui|fs-tool)\r?\n/.exec(this.buffer);
        if (match) {
          this.handlers.text(this.buffer.slice(0, match.index));
          this.mode = match[1] as "fs-ui" | "fs-tool";
          this.buffer = this.buffer.slice(match.index + match[0].length);
        } else {
          // Keep a possible partial protocol marker; ordinary text is not delayed by whole lines.
          const tail =
            /`{1,3}(?:f(?:s(?:-(?:u(?:i)?|t(?:o(?:o(?:l)?)?)?)?)?)?)?\r?$/.exec(
              this.buffer,
            )?.[0] || "";
          const ready = this.buffer.slice(0, this.buffer.length - tail.length);
          if (ready) this.handlers.text(ready);
          this.buffer = tail;
          return;
        }
      }
    }
  }
  finish() {
    if (this.buffer)
      this.handlers.text(
        this.mode === "text"
          ? this.buffer
          : "\n[Composant interrompu ; le texte précédent est conservé.]\n",
      );
    this.buffer = "";
    this.mode = "text";
  }
}
