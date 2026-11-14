import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

test("official local ChatGPT lifecycle", async (t) => {
  const originalCwd = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "clevex-siwc-test-"));
  const originalFetch = globalThis.fetch;
  const originalFlag = process.env.CLEVEX_CHATGPT_LOCAL;
  process.chdir(directory);
  process.env.CLEVEX_CHATGPT_LOCAL = "1";
  const runtime = await import("../src/lib/server/chatgpt-local.ts");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test",
    alg: "RS256",
    use: "sig",
  };
  let authorization: URL;
  let nonceOverride: string | undefined;
  let sharing = true;
  let expiresIn = 3600;
  let refreshes = 0;
  let tokenCalls = 0;
  let revocations = 0;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
    if (url.endsWith("/.well-known/jwks.json"))
      return Response.json({ keys: [jwk] });
    if (url.endsWith("/.well-known/openid-configuration"))
      return Response.json({
        revocation_endpoint: "https://auth.openai.com/revoke",
      });
    if (url.endsWith("/revoke")) {
      revocations++;
      return new Response(null, { status: 200 });
    }
    if (url.endsWith("/models")) {
      assert.match(
        String((init?.headers as Record<string, string>).authorization),
        /^Bearer access-/,
      );
      return Response.json({
        models: [
          {
            slug: "available-model",
            display_name: "Available",
            visibility: "list",
          },
          { slug: "hidden", visibility: "hide" },
        ],
      });
    }
    assert.equal(url, "https://auth.openai.com/api/accounts/oauth/token");
    tokenCalls++;
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("resource"), "https://api.openai.com/v1");
    assert.equal(body.get("client_id"), "oaiapp_test");
    if (body.get("grant_type") === "refresh_token") {
      refreshes++;
      assert.equal(body.get("scope"), null);
      return Response.json({
        access_token: "access-refreshed",
        refresh_token: "refresh-rotated",
        expires_in: 3600,
      });
    }
    assert.equal(
      body.get("redirect_uri"),
      authorization.searchParams.get("redirect_uri"),
    );
    assert.ok(body.get("code_verifier"));
    const token = await new SignJWT({
      nonce: nonceOverride ?? authorization.searchParams.get("nonce"),
      email: "test@example.com",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://auth.openai.com")
      .setAudience("oaiapp_test")
      .setSubject("test-subject")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    return Response.json({
      access_token: "access-initial",
      refresh_token: "refresh-initial",
      id_token: token,
      expires_in: expiresIn,
      scope: sharing ? "openid chatgpt.tokens.use.direct" : "openid",
    });
  }) as typeof fetch;
  const begin = async () => {
    authorization = new URL(
      (await runtime.serialize(() => runtime.startLocalSignIn())).url,
    );
    return new URL(authorization.searchParams.get("redirect_uri")!);
  };
  const finish = async (
    callback: URL,
    state = authorization.searchParams.get("state")!,
  ) => {
    callback.search = new URLSearchParams({
      state,
      code: "one-time-code",
      client_id: "oaiapp_test",
    }).toString();
    return fetch(callback);
  };
  try {
    await t.test(
      "requires opt-in, exact local host and same-origin requests",
      () => {
        const request = (url: string, headers: Record<string, string>) =>
          new Request(url, { headers });
        runtime.requireLocalChatGPT(
          request("http://localhost:3000/api", {
            host: "localhost:3000",
            "x-clevex": "1",
          }),
        );
        // Next.js canonicalizes the internal URL while preserving the browser Host.
      runtime.requireLocalChatGPT(request("http://localhost:3000/api", {
        host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "x-clevex": "1",
      }));
      assert.throws(() =>
          runtime.requireLocalChatGPT(
            request("http://localhost:3000/api", {
              host: "localhost:3000",
              "x-clevex": "1",
              origin: "https://evil.example",
            }),
          ),
        );
        assert.throws(() =>
          runtime.requireLocalChatGPT(
            request("http://evil.example/api", {
              host: "evil.example",
              "x-clevex": "1",
            }),
          ),
        );
        assert.throws(() =>
          runtime.requireLocalChatGPT(
            request("http://localhost:3000/api", { host: "localhost:3000" }),
          ),
        );
        process.env.CLEVEX_CHATGPT_LOCAL = "0";
        assert.throws(() =>
          runtime.requireLocalChatGPT(
            request("http://localhost:3000/api", {
              host: "localhost:3000",
              "x-clevex": "1",
            }),
          ),
        );
        process.env.CLEVEX_CHATGPT_LOCAL = "1";
      },
    );
    await t.test(
      "starts loopback listener before authorization, uses fresh PKCE and nonce",
      async () => {
        const callback = await begin();
        assert.equal(callback.hostname, "127.0.0.1");
        assert.equal(
          authorization.searchParams.get("client_id"),
          "dynamic_agent_client",
        );
        assert.equal(
          authorization.searchParams.get("agent_name_hint"),
          "Clevex",
        );
        assert.match(
          authorization.searchParams.get("ext_agent_host_id")!,
          /^urn:uuid:/,
        );
        assert.equal(
          authorization.searchParams.get("code_challenge_method"),
          "S256",
        );
        assert.notEqual(
          authorization.searchParams.get("state"),
          authorization.searchParams.get("nonce"),
        );
        assert.equal((await finish(callback, "wrong-state")).status, 400);
        assert.equal(tokenCalls, 0);
        assert.equal((await finish(callback)).status, 200);
      },
    );
    await t.test(
      "persists owner-only credentials, exposes only metadata and discovers visible models",
      async () => {
        const session = await runtime.localSession();
        assert.equal(session.sharing, true);
        assert.equal(session.email, "test@example.com");
        assert.doesNotMatch(
          JSON.stringify(session),
          /access-initial|refresh-initial|idToken/,
        );
        assert.deepEqual(await runtime.localModels(), [
          { id: "available-model", label: "Available", provider: "chatgpt" },
        ]);
        assert.equal(
          (await stat(path.join(directory, ".clevex/chatgpt.json"))).mode &
            0o777,
          0o600,
        );
        assert.equal(
          (await stat(path.join(directory, ".clevex"))).mode & 0o777,
          0o700,
        );
      },
    );
    await t.test(
      "rejects identity nonce mismatch and preserves the active account",
      async () => {
        const callback = await begin();
        nonceOverride = "wrong-nonce";
        assert.equal(
          authorization.searchParams.get("client_id"),
          "oaiapp_test",
        );
        assert.equal((await finish(callback)).status, 400);
        assert.equal((await runtime.localSession()).sharing, true);
        nonceOverride = undefined;
      },
    );
    await t.test(
      "identity-only sign-in cannot make plan requests",
      async () => {
        const callback = await begin();
        sharing = false;
        assert.equal((await finish(callback)).status, 200);
        assert.equal((await runtime.localSession()).sharing, false);
        await assert.rejects(
          runtime.localCredential(),
          /Enable ChatGPT plan usage/,
        );
        sharing = true;
      },
    );
    await t.test(
      "serializes refresh and saves the rotating token",
      async () => {
        const callback = await begin();
        expiresIn = 1;
        assert.equal((await finish(callback)).status, 200);
        const credentials = await Promise.all([
          runtime.localCredential(),
          runtime.localCredential(),
        ]);
        assert.equal(refreshes, 1);
        assert.equal(credentials[0].accessToken, "access-refreshed");
        const store = JSON.parse(
          await readFile(path.join(directory, ".clevex/chatgpt.json"), "utf8"),
        );
        assert.equal(
          store.profiles.oaiapp_test.refreshToken,
          "refresh-rotated",
        );
      },
    );
    await t.test(
      "disconnect revokes refresh token and retains registration for reconnect",
      async () => {
        await runtime.serialize(runtime.disconnectLocal);
        assert.equal(revocations, 1);
        const session = await runtime.localSession();
        assert.equal(session.connected, false);
        assert.equal(session.profiles[0].id, "oaiapp_test");
        const store = JSON.parse(
          await readFile(path.join(directory, ".clevex/chatgpt.json"), "utf8"),
        );
        assert.equal(store.profiles.oaiapp_test.accessToken, undefined);
        assert.equal(store.profiles.oaiapp_test.refreshToken, undefined);
      },
    );
  } finally {
    await runtime.serialize(runtime.disconnectLocal);
    globalThis.fetch = originalFetch;
    if (originalFlag === undefined) delete process.env.CLEVEX_CHATGPT_LOCAL;
    else process.env.CLEVEX_CHATGPT_LOCAL = originalFlag;
    process.chdir(originalCwd);
    await rm(directory, { recursive: true, force: true });
  }
});
