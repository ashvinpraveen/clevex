"use client";
import { setCredentials, type ChatGPTCredential } from "./store";
import { getSettings, updateSettings } from "../settings";
import type { ModelOption } from "../ai/models";
export type ChatGPTSession = {
  connected: boolean;
  sharing: boolean;
  email?: string;
  pending?: boolean;
  error?: string;
  selected?: string;
  profiles: { id: string; email?: string; connected: boolean }[];
};
export async function chatGPTAction<T>(
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("/api/local/chatgpt-callback", {
    method: body ? "POST" : "GET",
    headers: {
      "x-clevex": "1",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "ChatGPT connection failed.");
  return data;
}
export async function refreshChatGPTSession() {
  const session = await chatGPTAction<ChatGPTSession>();
  let models: ModelOption[] = [];
  if (session.sharing) {
    try {
      const result = await chatGPTAction<{ models: ModelOption[] }>({
        action: "models",
      });
      models = result.models;
      const selected = getSettings().model;
      if (
        !selected.startsWith("claude") &&
        models.length &&
        !models.some((m) => m.id === selected)
      ) {
        updateSettings({ model: models[0].id });
      }
    } catch (err) {
      session.error =
        err instanceof Error
          ? err.message
          : "Model discovery failed. Retry sign-in.";
    }
  }
  const credential: ChatGPTCredential | undefined = session.connected
    ? {
        kind: "chatgpt-local",
        email: session.email,
        sharing: session.sharing,
        models,
      }
    : undefined;
  setCredentials((c) => ({ ...c, chatgpt: credential }));
  return session;
}
export async function startChatGPTLogin(newProfile = false) {
  return chatGPTAction<{ url: string }>({ action: "start", newProfile });
}
export async function disconnectChatGPT() {
  await chatGPTAction({ action: "disconnect" });
  setCredentials((c) => ({ ...c, chatgpt: undefined }));
}
export async function ensureChatGPT() {
  const session = await refreshChatGPTSession();
  if (!session.sharing)
    throw new Error("Connect ChatGPT and enable plan usage first.");
}
export function selectFirstChatGPTModel(models: ModelOption[]) {
  if (models[0]) updateSettings({ model: models[0].id });
}
