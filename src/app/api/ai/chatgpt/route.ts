import {
  localCredential,
  localModels,
  requireLocalChatGPT,
  serialize,
} from "@/lib/server/chatgpt-local";
import { CHATGPT } from "@/lib/auth/constants";
import type { WireRequest } from "@/lib/ai/wire";
import { serverEnv } from "@/lib/server/env";
import { forwardChatGPTStream } from "@/lib/server/chatgpt-stream";
import { sseResponse } from "@/lib/server/sse";

export const runtime = "nodejs";
export const maxDuration = 300;

type Target = { url: string; headers: Record<string, string> };

async function resolveTarget(
  body: WireRequest,
  req: Request,
): Promise<Target | null> {
  if (body.auth?.kind === "chatgpt-local") {
    requireLocalChatGPT(req);
    const { profile, models } = await serialize(async () => ({
      profile: await localCredential(),
      models: await localModels(),
    }));
    if (!models.some((m) => m.id === body.model))
      throw new Error("Choose a model available to your ChatGPT account.");
    return {
      url: `${CHATGPT.apiBase}/responses`,
      headers: {
        authorization: `Bearer ${profile.accessToken}`,
        accept: "text/event-stream",
        "content-type": "application/json",
      },
    };
  }
  if (body.auth)
    throw new Error("Reconnect ChatGPT using the official local sign-in flow.");
  if (serverEnv.openaiGateway) {
    return {
      url: `${serverEnv.openaiGateway}/responses`,
      headers: {
        authorization: `Bearer ${serverEnv.openaiGatewayKey ?? "clevex"}`,
        accept: "text/event-stream",
        "content-type": "application/json",
      },
    };
  }
  return null;
}

function buildInput(body: WireRequest, systemAsDeveloper: boolean) {
  const input: unknown[] = [];
  if (systemAsDeveloper) {
    input.push({
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: body.system }],
    });
  }
  if (body.context) {
    input.push({
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: body.context }],
    });
  }
  for (const m of body.messages) {
    if (m.role === "user") {
      const content: unknown[] = [];
      for (const img of m.images ?? []) {
        content.push({
          type: "input_image",
          image_url: `data:${img.mime};base64,${img.data}`,
        });
      }
      content.push({ type: "input_text", text: m.text });
      input.push({ type: "message", role: "user", content });
    } else {
      input.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: m.text }],
      });
    }
  }
  return input;
}

export async function POST(req: Request) {
  const body = (await req.json()) as WireRequest;
  let target: Target | null;
  try {
    target = await resolveTarget(body, req);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "ChatGPT unavailable." },
      { status: 403 },
    );
  }
  if (!target) {
    return Response.json({ error: "Connect ChatGPT first." }, { status: 401 });
  }

  return sseResponse(async (emit, signal) => {
    const send = async (systemAsDeveloper: boolean) => {
      const payload: Record<string, unknown> = {
        model: body.model,
        instructions: systemAsDeveloper
          ? "You are a helpful assistant."
          : body.system,
        input: buildInput(body, systemAsDeveloper),
        stream: true,
        store: false,
        reasoning: { effort: body.effort ?? "medium", summary: "auto" },
      };
      return fetch(target.url, {
        method: "POST",
        headers: target.headers,
        body: JSON.stringify(payload),
        signal,
      });
    };

    let res = await send(false);
    if (res.status === 400) {
      const text = await res.clone().text();
      if (/instruction/i.test(text)) res = await send(true);
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      emit({
        type: "error",
        message: describeError(res.status, text),
        status: res.status,
      });
      return;
    }

    await forwardChatGPTStream(res.body, body.model, emit);
  }, req.signal);
}

function describeError(status: number, text: string) {
  let msg = text;
  try {
    const j = JSON.parse(text);
    msg =
      j.detail?.message || j.detail || j.error?.message || j.message || text;
  } catch {
    /* keep raw */
  }
  if (status === 401)
    return "ChatGPT rejected the session (401). Sign in again.";
  if (status === 429)
    return `ChatGPT usage limit reached. ${typeof msg === "string" ? msg : ""}`.trim();
  if (status === 404 || /model/i.test(String(msg)))
    return `ChatGPT: ${msg || "model not available on your plan"}`;
  return `ChatGPT error ${status}: ${String(msg).slice(0, 400)}`;
}
