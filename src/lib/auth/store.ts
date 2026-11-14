"use client";

import { useEffect, useSyncExternalStore } from "react";

export type ChatGPTCredential = {
  kind: "chatgpt-local";
  email?: string;
  sharing: boolean;
  models: import("../ai/models").ModelOption[];
};

export type ClaudeCredential =
  | {
      kind: "claude-oauth";
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      email?: string;
      plan?: string;
      source: "oauth" | "import" | "setup-token";
    }
  | { kind: "anthropic-key"; apiKey: string; source: "key" };

export type Credentials = {
  chatgpt?: ChatGPTCredential;
  claude?: ClaudeCredential;
};

const KEY = "clevex.credentials.v1";
const listeners = new Set<() => void>();
let cache: Credentials | null = null;
const EMPTY: Credentials = {};

function read(): Credentials {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "{}") as Credentials;
    // Drop legacy ChatGPT tokens. Only the local runtime can restore a connection.
    if (cache.chatgpt) {
      delete cache.chatgpt;
      localStorage.setItem(KEY, JSON.stringify(cache));
    }
  } catch {
    cache = {};
  }
  return cache;
}

export function getCredentials(): Credentials {
  return read();
}

export function setCredentials(update: (c: Credentials) => Credentials) {
  const next = update({ ...read() });
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, chatgpt: undefined }));
  } catch {
    /* storage may be unavailable; keep in memory */
  }
  listeners.forEach((l) => l());
}

let restoring: Promise<unknown> | undefined;
export function useCredentials(): Credentials {
  useEffect(() => {
    restoring ??= import("./chatgpt")
      .then((m) => m.refreshChatGPTSession())
      .catch(() => {});
  }, []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          cache = null;
          cb();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => EMPTY,
  );
}

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64 + "===".slice((b64.length + 3) % 4))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
