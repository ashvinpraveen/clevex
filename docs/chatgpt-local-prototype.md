# Official ChatGPT plan usage: local prototype

This branch replaces the ChatGPT Codex-client impersonation, browser token storage,
and Codex credential import with the official Sign in with ChatGPT OSS flow.
Claude integration is unchanged and is outside this prototype's validation scope.

## Run locally

```sh
pnpm install --frozen-lockfile
CLEVEX_CHATGPT_LOCAL=1 pnpm dev --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/local/chatgpt` to connect before configuring Convex.
Choose **Continue with ChatGPT**, authorize Clevex in OpenAI's browser flow, then
return to Clevex. Eligible Plus/Pro accounts can enable ChatGPT plan usage.
The panel lists account-specific available models and links to ChatGPT usage settings.
Connection success and model discovery alone do not prove inference works.
After authorizing, run the optional live smoke test (uses a small amount of your
ChatGPT allowance):

```sh
node --experimental-strip-types --no-warnings scripts/verify-chatgpt-local.ts
```

It checks completed inference and parses/applies a typo fix using Clevex's actual
edit parser. Run it while no other Clevex operation is refreshing credentials;
this CLI smoke test is a separate process from the local server.

The normal editor still requires the existing Convex/Better Auth setup described
in `getting-started.md`. After that setup, connect through the editor, select a
listed ChatGPT model, request a small LaTeX edit, review and apply it, and compile.
Check that generation finishes without an error and the PDF includes the edit.

Bind to loopback, use a single Next.js process, and keep this on your own machine.
Do not deploy this local credential runtime as a multi-user service. It has one
selected ChatGPT connection per local installation, shared by local browser tabs.
Paid or remotely hosted offerings require the separate OpenAI access process.

## Storage and behavior

- `.clevex/chatgpt.json` stores a stable host ID, per-registration credentials,
  verified identity, granted scopes and the active profile. It is ignored by Git;
  the directory is `0700`, files are atomically written as `0600`.
- Browser JavaScript receives connection metadata and model choices, never tokens.
  Legacy browser-held ChatGPT tokens are removed; users must reconnect.
- Authorization uses a ready loopback listener on `127.0.0.1` with a free port,
  PKCE S256, expiring one-time state and an OIDC nonce. ID-token signature,
  issuer, audience, expiry and subject are validated using `jose` and OpenAI JWKS.
- Returning accounts reuse their issued client ID. Add account creates a new
  registration. Switching profiles refreshes model discovery.
- Plan calls require the granted `chatgpt.tokens.use.direct` scope, and use
  `https://api.openai.com/v1/responses` with `stream: true`, `store: false`.
- Refreshes are serialized, rotating credentials are stored together, and confirmed
  terminal refresh failures clear unusable credentials while retaining registration.
- Disconnect revokes the refresh token before clearing credentials. A failed
  revocation leaves credentials available to retry; ChatGPT settings also allow
  disconnecting the application.
- The local endpoints require explicit local mode, exact loopback Host, a custom
  header, and same-origin browser requests. No hosted browser callback/paste flow
  or CLI credential import is supported.

## Verification

```sh
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint
pnpm build
```

OAuth tests use generated signing keys and mocked OpenAI endpoints. They require
permission to bind loopback sockets. They make no real OpenAI inference requests.
Live authorization, account eligibility, inference and the editor-to-PDF workflow
must be checked separately with the user's account and configured Convex project.

References:
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

## Verified on 15 November 2026

- Live OpenAI authorization completed with Clevex's own dynamic registration.
- Account-specific model discovery and a live `gpt-6.1-sol` smoke test passed.
- A dedicated Convex development project was configured, and the user completed
  Clevex signup. The authenticated dashboard created a blank LaTeX project.
- In the actual editor, GPT-6.1 Sol proposed a reviewable diff updating the title
  and introduction. Applying it changed `main.tex` and saved it to Convex.
- Compilation through the configured cloud `pdflatex` service succeeded. The PDF
  preview displayed both edits. Download produced a valid one-page PDF, whose
  text and independently rendered page were checked.
- A full browser reload retained the project name, edited LaTeX, chat history,
  and applied-diff status. The PDF preview remained available.
- All 16 automated checks, ESLint and TypeScript passed. The production build
  completed successfully with `next build --webpack` after Convex configuration.
  The environment's default Turbopack worker previously failed to bind a port.
- This verifies the local app and its development backend. No production rollout
  or merge was performed.
