import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { CHATGPT } from "../auth/constants.ts";

export type LocalProfile = {
  clientId: string;
  subject: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  scopes: string[];
};
class OAuthError extends Error {
  code: string;
  constructor(code: string) {
    super(`ChatGPT authorization failed (${code}). Try signing in again.`);
    this.code = code;
  }
}
type Store = {
  hostId: string;
  selected?: string;
  profiles: Record<string, LocalProfile>;
};
type Pending = {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  clientId?: string;
  subject?: string;
  expiresAt: number;
};
type State = {
  pending?: Pending;
  listener?: http.Server;
  timer?: NodeJS.Timeout;
  error?: string;
  refreshing?: Promise<LocalProfile>;
  serial: Promise<unknown>;
};
const g = globalThis as unknown as { __clevexSiwc?: State };
const state = (g.__clevexSiwc ??= { serial: Promise.resolve() });
const directory = path.join(process.cwd(), ".clevex");
const file = path.join(directory, "chatgpt.json");
const jwks = createRemoteJWKSet(
  new URL("https://auth.openai.com/.well-known/jwks.json"),
);
const random = () => randomBytes(32).toString("base64url");

export { requireLocalChatGPT } from "./chatgpt-guard.ts";
async function load(): Promise<Store> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const store: Store = { hostId: `urn:uuid:${randomUUID()}`, profiles: {} };
    await save(store);
    return store;
  }
}
async function save(store: Store) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(store), { mode: 0o600 });
  await rename(temporary, file);
}
export function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = state.serial.then(fn);
  state.serial = result.catch(() => {});
  return result;
}
async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(CHATGPT.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, resource: CHATGPT.apiBase }),
  });
  const data = await res.json();
  if (!res.ok) {
    const code = typeof data.error === "string" ? data.error : "oauth_error";
    throw new OAuthError(code);
  }
  return data as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    scope?: string;
    expires_in?: number;
  };
}
function closeListener() {
  clearTimeout(state.timer);
  state.listener?.close();
  state.listener = undefined;
  state.pending = undefined;
}
async function callback(url: URL) {
  const pending = state.pending;
  if (
    !pending ||
    pending.expiresAt <= Date.now() ||
    url.searchParams.get("state") !== pending.state
  ) {
    throw new Error(
      "Sign-in state is missing, expired or does not match. Start again.",
    );
  }
  state.pending = undefined; // Consume once, before any exchange.
  if (url.searchParams.has("error"))
    throw new Error("ChatGPT sign-in was declined. Start again when ready.");
  const clientId = url.searchParams.get("client_id") || pending.clientId;
  if (
    !clientId ||
    clientId === "dynamic_agent_client" ||
    (pending.clientId && pending.clientId !== clientId)
  ) {
    throw new Error("ChatGPT did not return the expected client registration.");
  }
  const code = url.searchParams.get("code");
  if (!code) throw new Error("The sign-in callback has no code.");
  const store = await load();
  // Retain a returning registration even when a code must be retried.
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
  });
  if (!tokens.id_token || !tokens.access_token)
    throw new Error("ChatGPT returned an incomplete token response.");
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: CHATGPT.issuer,
    audience: clientId,
    requiredClaims: ["sub", "exp", "iat"],
    clockTolerance: 5,
  });
  if (
    payload.nonce !== pending.nonce ||
    !payload.sub ||
    (pending.subject && pending.subject !== payload.sub)
  ) {
    throw new Error("ChatGPT identity could not be verified for this sign-in.");
  }
  store.profiles[clientId] = {
    clientId,
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    scopes: (tokens.scope || "").split(" ").filter(Boolean),
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
  store.selected = clientId;
  await save(store);
}
export async function startLocalSignIn(newProfile = false) {
  closeListener();
  state.error = undefined;
  const store = await load();
  const profile =
    !newProfile && store.selected ? store.profiles[store.selected] : undefined;
  const pending: Pending = {
    state: random(),
    nonce: random(),
    verifier: random(),
    redirectUri: "",
    clientId: profile?.clientId,
    subject: profile?.subject,
    expiresAt: Date.now() + 600_000,
  };
  const listener = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", pending.redirectUri);
    if (url.pathname !== "/auth/callback" || req.method !== "GET") {
      res.writeHead(404).end();
      return;
    }
    if (url.searchParams.get("state") !== state.pending?.state) {
      res.writeHead(400).end("Invalid sign-in state.");
      return;
    }
    try {
      await serialize(() => callback(url));
      res.writeHead(200, {
        "content-type": "text/html",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      });
      res.end(
        "<!doctype html><title>Clevex</title><p>ChatGPT sign-in completed. Return to Clevex to check plan access.</p>",
      );
    } catch (err) {
      state.error = err instanceof Error ? err.message : "Sign-in failed.";
      res.writeHead(400, {
        "content-type": "text/plain",
        "cache-control": "no-store",
      });
      res.end("Sign-in failed. Return to Clevex and try again.");
    } finally {
      if (state.listener === listener) closeListener();
    }
  });
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (!address || typeof address === "string")
    throw new Error("Could not start sign-in callback.");
  pending.redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
  state.pending = pending;
  state.listener = listener;
  state.timer = setTimeout(() => {
    state.error = "Sign-in timed out. Start again.";
    closeListener();
  }, 600_000);
  state.timer.unref();
  const url = new URL(CHATGPT.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: profile?.clientId || "dynamic_agent_client",
    ...(profile
      ? { login_hint: profile.email || "" }
      : { agent_name_hint: "Clevex" }),
    ext_agent_host_id: store.hostId,
    redirect_uri: pending.redirectUri,
    scope: CHATGPT.scope,
    resource: CHATGPT.apiBase,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update(pending.verifier)
      .digest("base64url"),
  }).toString();
  return { url: url.toString() };
}
export async function localSession() {
  const store = await load();
  const profile = store.selected ? store.profiles[store.selected] : undefined;
  return {
    connected: !!profile?.accessToken,
    sharing:
      !!profile?.accessToken &&
      profile.scopes.includes("chatgpt.tokens.use.direct"),
    email: profile?.email,
    pending: !!state.pending,
    error: state.error,
    selected: store.selected,
    profiles: Object.values(store.profiles).map((p) => ({
      id: p.clientId,
      email: p.email,
      connected: !!p.accessToken,
    })),
  };
}
export async function selectLocalProfile(id: string) {
  const store = await load();
  if (!store.profiles[id]) throw new Error("Unknown ChatGPT account.");
  closeListener();
  state.error = undefined;
  store.selected = id;
  await save(store);
}
export async function localCredential(): Promise<LocalProfile> {
  const store = await load();
  const profile = store.selected ? store.profiles[store.selected] : undefined;
  if (!profile?.accessToken) throw new Error("Connect ChatGPT first.");
  if (!profile.scopes.includes("chatgpt.tokens.use.direct"))
    throw new Error("Enable ChatGPT plan usage by signing in again.");
  if ((profile.expiresAt || 0) > Date.now() + 120_000) return profile;
  if (!profile.refreshToken)
    throw new Error("ChatGPT session expired. Sign in again.");
  state.refreshing ??= (async () => {
    try {
      const tokens = await tokenRequest({
        grant_type: "refresh_token",
        client_id: profile.clientId,
        refresh_token: profile.refreshToken!,
      });
      if (!tokens.access_token)
        throw new Error("ChatGPT refresh returned no access token.");
      const updated = {
        ...profile,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? profile.refreshToken,
        idToken: tokens.id_token ?? profile.idToken,
        scopes:
          tokens.scope === undefined ? profile.scopes : tokens.scope.split(" "),
        expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      };
      store.profiles[profile.clientId] = updated;
      await save(store);
      return updated;
    } catch (err) {
      if (
        err instanceof OAuthError &&
        [
          "invalid_grant",
          "invalid_refresh_token",
          "token_expired",
          "refresh_token_expired",
          "refresh_token_invalidated",
          "refresh_token_reused",
        ].includes(err.code)
      ) {
        store.profiles[profile.clientId] = {
          clientId: profile.clientId,
          subject: profile.subject,
          email: profile.email,
          scopes: [],
        };
        await save(store);
      }
      throw err;
    } finally {
      state.refreshing = undefined;
    }
  })();
  return state.refreshing;
}
export async function localModels() {
  const profile = await localCredential();
  const res = await fetch(`${CHATGPT.apiBase}/models`, {
    headers: { authorization: `Bearer ${profile.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok)
    throw new Error(
      `ChatGPT model discovery failed (${res.status}). Sign in again or retry later.`,
    );
  const data = (await res.json()) as {
    models?: { slug: string; display_name: string; visibility: string }[];
  };
  return (data.models || [])
    .filter((m) => m.visibility === "list")
    .map((m) => ({
      id: m.slug,
      label: m.display_name,
      provider: "chatgpt" as const,
    }));
}
export async function disconnectLocal() {
  closeListener();
  const store = await load();
  const profile = store.selected ? store.profiles[store.selected] : undefined;
  if (!profile) return;
  if (profile.refreshToken) {
    const discovery = await fetch(
      `${CHATGPT.issuer}/.well-known/openid-configuration`,
    ).then((r) => {
      if (!r.ok)
        throw new Error(
          "Could not discover ChatGPT sign-out endpoint. Retry disconnect.",
        );
      return r.json();
    });
    const endpoint = new URL(discovery.revocation_endpoint);
    if (endpoint.origin !== CHATGPT.issuer)
      throw new Error("Unexpected ChatGPT revocation endpoint.");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: profile.refreshToken,
        token_type_hint: "refresh_token",
        client_id: profile.clientId,
      }),
    });
    if (!res.ok)
      throw new Error(
        "ChatGPT sign-out was not confirmed. Retry or disconnect in ChatGPT settings.",
      );
  }
  store.profiles[profile.clientId] = {
    clientId: profile.clientId,
    subject: profile.subject,
    email: profile.email,
    scopes: [],
  };
  await save(store);
}
