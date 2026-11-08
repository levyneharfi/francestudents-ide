import { test } from "node:test";
import assert from "node:assert/strict";
import { ReplyParser } from "../../../packages/francestudent-client/src/reply-parser";
import {
  isGPT,
  validBlock,
  type ReplyBlock,
} from "../../../packages/francestudent-client/src/replies";
const block: ReplyBlock = {
  v: 1,
  id: "tasks",
  kind: "checklist",
  title: "À préparer",
  items: [{ id: "notes", label: "Relire les notes" }],
};
test("reply framing is invariant under every SSE split and per-character streaming", () => {
  const text = `Avant\n\n\`\`\`fs-ui\n${JSON.stringify(block)}\n\`\`\`\nAprès`;
  for (let split = 0; split <= text.length; split++) {
    let output = "";
    const blocks: ReplyBlock[] = [];
    const p = new ReplyParser(
      {
        text: (s) => (output += s),
        block: (b) => blocks.push(b),
        call: () => assert.fail(),
      },
      true,
      false,
    );
    p.push(text.slice(0, split));
    p.push(text.slice(split));
    p.finish();
    assert.equal(output, "Avant\n\n\nAprès");
    assert.deepEqual(blocks, [block]);
  }
  let output = "";
  const blocks: ReplyBlock[] = [];
  const p = new ReplyParser(
    {
      text: (s) => (output += s),
      block: (b) => blocks.push(b),
      call: () => assert.fail(),
    },
    true,
    false,
  );
  for (const char of text) p.push(char);
  p.finish();
  assert.deepEqual(blocks, [block]);
  assert.equal(output, "Avant\n\n\nAprès");
});
test("invalid and partial components degrade to text; tool markers never execute when disabled", () => {
  let output = "",
    calls = 0;
  const p = new ReplyParser(
    {
      text: (s) => (output += s),
      block: () => assert.fail(),
      call: () => calls++,
    },
    true,
    false,
  );
  p.push(
    'Texte\n```fs-tool\n{"appId":"gmail","tool":"send","arguments":{}}\n```\n```fs-ui\n{"v":1',
  );
  p.finish();
  assert.equal(calls, 0);
  assert.match(output, /non pris en charge/);
  assert.match(output, /interrompu/);
});
test("GPT gating uses provider and model metadata rather than display names", () => {
  assert.ok(isGPT({ provider: "OPENAI", model: "gpt-4.1" }));
  assert.ok(isGPT({ provider: "azure-openai", model: "o3-mini" }));
  assert.equal(isGPT({ provider: "anthropic", model: "gpt-fake" }), false);
  assert.equal(isGPT({}), false);
});
test("declarative validators reject unsafe diagrams and malformed charts", () => {
  assert.ok(validBlock(block));
  assert.ok(
    validBlock({
      v: 1,
      id: "flow",
      kind: "diagram",
      title: "Flux",
      code: "flowchart TD\n A[Notes] --> B[Résumé]",
    }),
  );
  for (const code of [
    'flowchart TD\n click A "https://evil.test"',
    "flowchart TD\n A[<img src=x>]",
    "%%{init: {}}%%\nflowchart TD\n A --> B",
  ])
    assert.equal(
      validBlock({ v: 1, id: "flow", kind: "diagram", title: "Flux", code }),
      false,
    );
  assert.equal(
    validBlock({
      v: 1,
      id: "c",
      kind: "chart",
      title: "C",
      chart: "bar",
      unit: "h",
      data: [{ label: "A", value: Infinity }],
    }),
    false,
  );
});
