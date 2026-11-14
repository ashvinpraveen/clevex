import { readSSE, type StreamEvent } from "./sse.ts";

/** A closed transport is not proof of completed inference. */
export async function forwardChatGPTStream(
  stream: ReadableStream<Uint8Array>,
  model: string,
  emit: (event: StreamEvent) => void,
) {
  let completed = false;
  let failed = false;
  let usage: StreamEvent & { type: "done" } = { type: "done", model: model };
  for await (const { event, data } of readSSE(stream)) {
    if (data === "[DONE]") break;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    const type = (ev.type as string) || event;
    switch (type) {
      case "response.output_text.delta":
        emit({ type: "text", text: String(ev.delta ?? "") });
        break;
      case "response.reasoning_summary_text.delta":
      case "response.reasoning_text.delta":
        emit({ type: "thinking", text: String(ev.delta ?? "") });
        break;
      case "response.reasoning_summary_part.added":
        emit({ type: "thinking", text: "\n\n" });
        break;
      case "response.completed": {
        completed = true;
        const u = (
          ev.response as {
            usage?: { input_tokens?: number; output_tokens?: number };
          }
        )?.usage;
        usage = {
          type: "done",
          model: model,
          usage: { input: u?.input_tokens, output: u?.output_tokens },
        };
        break;
      }
      case "response.failed":
      case "response.incomplete": {
        failed = true;
        const r = ev.response as {
          error?: { message?: string };
          incomplete_details?: { reason?: string };
        };
        emit({
          type: "error",
          message:
            r?.error?.message ||
            `Response ${type.split(".")[1]}: ${r?.incomplete_details?.reason ?? "unknown"}`,
        });
        break;
      }
      case "error":
        failed = true;
        emit({
          type: "error",
          message: String(
            (ev as { message?: string }).message ?? "ChatGPT error",
          ),
        });
        break;
    }
  }
  if (completed && !failed) emit(usage);
  else if (!failed)
    emit({
      type: "error",
      message:
        "ChatGPT stream ended before the response completed. Retry the edit.",
    });
}
