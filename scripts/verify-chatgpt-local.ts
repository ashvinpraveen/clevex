/** Manual live smoke test. Uses a small amount of the connected ChatGPT allowance. */
import assert from "node:assert/strict";
import { localCredential, localModels, serialize } from "../src/lib/server/chatgpt-local.ts";
import { forwardChatGPTStream } from "../src/lib/server/chatgpt-stream.ts";
import { applyBlock, splitSegments } from "../src/lib/ai/edits.ts";
import { CHATGPT } from "../src/lib/auth/constants.ts";

const { profile, models } = await serialize(async () => ({ profile: await localCredential(), models: await localModels() }));
const model = models[0]?.id;
assert.ok(model, "No models are available for the connected account.");
const source = "\\documentclass{article}\n\\begin{document}\nHello wrold.\n\\end{document}\n";
const response = await fetch(`${CHATGPT.apiBase}/responses`, {
  method: "POST",
  headers: { authorization: `Bearer ${profile.accessToken}`, "content-type": "application/json" },
  body: JSON.stringify({ model, store: false, stream: true, input: [{ role: "user", content: [
    { type: "input_text", text: `Fix only the typo in main.tex below. Return a single Clevex edit block, without a code fence, using this format:\n<edit file="main.tex">\n<<<<<<< SEARCH\noriginal line\n=======\ncorrected line\n>>>>>>> REPLACE\n</edit>\n\nFile:\n${source}` },
  ] }] }),
  signal: AbortSignal.timeout(60_000),
});
assert.ok(response.ok && response.body, `ChatGPT inference failed (${response.status}).`);
let text = "";
let completed = false;
await forwardChatGPTStream(response.body, model, event => {
  if (event.type === "text") text += event.text;
  if (event.type === "done") completed = true;
  if (event.type === "error") throw new Error(event.message);
});
assert.ok(completed, "ChatGPT response did not complete.");
const edit = splitSegments(text).find(segment => segment.type === "block");
assert.ok(edit?.type === "block" && edit.block.complete && edit.block.file === "main.tex", "No complete main.tex edit returned.");
const result = applyBlock(source, edit.block);
assert.ok(result.ok && result.content.includes("Hello world.") && !result.content.includes("wrold"), "The returned edit did not fix the typo.");
console.log(JSON.stringify({ model, completed, editParsed: true, editApplied: true }));
