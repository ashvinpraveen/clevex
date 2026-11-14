import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardChatGPTStream } from "../src/lib/server/chatgpt-stream.ts";
import type { StreamEvent } from "../src/lib/server/sse.ts";

async function events(items: object[]) {
  const bytes = new TextEncoder().encode(
    items.map((item) => `data: ${JSON.stringify(item)}\n\n`).join(""),
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const output: StreamEvent[] = [];
  await forwardChatGPTStream(stream, "available-model", (e) => output.push(e));
  return output;
}
test("completed ChatGPT response emits text and successful terminal event", async () => {
  const result = await events([
    { type: "response.output_text.delta", delta: "Hello" },
    {
      type: "response.completed",
      response: { usage: { input_tokens: 2, output_tokens: 1 } },
    },
  ]);
  assert.equal(result[0].type, "text");
  assert.deepEqual(result[1], {
    type: "done",
    model: "available-model",
    usage: { input: 2, output: 1 },
  });
});
test("interrupted ChatGPT transport does not report success", async () => {
  const result = await events([
    { type: "response.output_text.delta", delta: "Partial" },
  ]);
  assert.equal(result.at(-1)?.type, "error");
  assert.ok(!result.some((e) => e.type === "done"));
});
test("usage rejection after a text delta is still a failure", async () => {
  const result = await events([
    { type: "response.output_text.delta", delta: "Partial" },
    {
      type: "response.failed",
      response: {
        error: {
          code: "subscription_sharing_usage_limit_exceeded",
          message: "Usage limit reached.",
        },
      },
    },
  ]);
  assert.deepEqual(result.at(-1), {
    type: "error",
    message: "Usage limit reached.",
  });
  assert.ok(!result.some((e) => e.type === "done"));
});
