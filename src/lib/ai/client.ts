"use client";

import { ensureChatGPT } from "../auth/chatgpt";
import { ensureClaude } from "../auth/claude";
import { getCredentials } from "../auth/store";
import type { StreamEvent } from "../server/sse";
import { getServerConfig } from "../server-config";
import { providerOf } from "./models";
import type { Effort, WireMessage, WireRequest } from "./wire";

export type StreamOptions = {
  model: string;
  system: string;
  context?: string;
  messages: WireMessage[];
  effort?: Effort;
  sessionId?: string;
  signal?: AbortSignal;
  onText?: (delta: string, full: string) => void;
  onThinking?: (delta: string, full: string) => void;
  onStatus?: (text: string) => void;
};

export type StreamResult = {
  text: string;
  thinking: string;
  error?: string;
  model: string;
};

async function authFor(model: string): Promise<WireRequest["auth"]> {
  const provider = providerOf(model);
  const creds = getCredentials();
  const server = await getServerConfig();
  if (provider === "chatgpt") {
    if (!creds.chatgpt) {
      if (server.serverChatGPT) return undefined;
      throw new Error("Connect your ChatGPT account to use GPT models.");
    }
    await ensureChatGPT();
    return { kind: "chatgpt-local" };
  }
  if (!creds.claude) {
    if (server.serverClaude) return undefined;
    throw new Error("Connect your Claude account to use Claude models.");
  }
  const c = await ensureClaude();
  return c.kind === "anthropic-key"
    ? { kind: "anthropic-key", apiKey: c.apiKey }
    : { kind: "claude-oauth", accessToken: c.accessToken };
}

export function isProviderReady(
  model: string,
  server: { serverClaude: boolean; serverChatGPT: boolean },
) {
  const creds = getCredentials();
  return providerOf(model) === "chatgpt"
    ? !!creds.chatgpt?.sharing || server.serverChatGPT
    : !!creds.claude || server.serverClaude;
}

export async function streamCompletion(
  opts: StreamOptions,
): Promise<StreamResult> {
  let text = "";
  let thinking = "";
  let error: string | undefined;
  let model = opts.model;
  try {
    const auth = await authFor(opts.model);
    const body: WireRequest = {
      model: opts.model,
      system: opts.system,
      context: opts.context,
      messages: opts.messages,
      effort: opts.effort,
      auth,
      sessionId: opts.sessionId,
    };
    const res = await fetch(`/api/ai/${providerOf(opts.model)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-clevex": "1" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Request failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let ev: StreamEvent;
        try {
          ev = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (ev.type === "text") {
          text += ev.text;
          opts.onText?.(ev.text, text);
        } else if (ev.type === "thinking") {
          if (!thinking && !ev.text.trim()) continue;
          thinking += ev.text;
          opts.onThinking?.(ev.text, thinking);
        } else if (ev.type === "status") {
          opts.onStatus?.(ev.text);
        } else if (ev.type === "error") {
          error = ev.message;
        } else if (ev.type === "done") {
          model = ev.model || model;
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { text, thinking, model, error: undefined };
    }
    error = err instanceof Error ? err.message : String(err);
  }
  return { text, thinking, error, model };
}
