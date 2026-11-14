> **This branch:** ChatGPT now uses the official local Sign in with ChatGPT flow. Follow [the prototype guide](chatgpt-local-prototype.md). The ChatGPT instructions below describe the original upstream integration.

# Connecting ChatGPT & Claude

Open **Connect** from the top bar, or click the ChatGPT or Claude pill. A green
dot means the provider is ready.

## Where your credentials live

- Tokens are saved in **this browser's `localStorage`** only. They aren't stored
  in Convex, aren't synced to your account, and the server never keeps them.
- Each AI request sends the token to the clevex server, which forwards it to
  OpenAI or Anthropic and streams the reply back. The routes in
  `src/app/api/ai/*` and `src/app/api/providers/*` are stateless.
- Signing out of a provider in the Connect dialog deletes the token from the
  browser.

Because of this, a clevex deployment shared by several people never holds
anyone's subscription. The exception is if the operator sets one on purpose; see
[server-side credentials](configuration.md#server-side-ai-credentials).

## ChatGPT

Works with ChatGPT **Plus, Pro, Business, Edu and Enterprise** plans that include
Codex.

### Sign in with ChatGPT (recommended)

clevex uses the **public OAuth client of the
[Codex CLI](https://github.com/openai/codex)**: PKCE with S256 against
`auth.openai.com`. That client only allows one redirect URL,
`http://localhost:1455/auth/callback`, so the last step depends on where clevex
is running:

- **Running locally:** clevex starts a small listener on port 1455, catches the
  redirect and finishes sign-in automatically.
- **On a deployed site:** after you approve, the browser goes to a
  `localhost:1455/...` page that won't load. That's expected. Copy the full URL
  from the address bar and paste it into the dialog.

clevex refreshes the session automatically shortly before it expires.

### Import from the Codex CLI

If you already use `codex`, you can reuse its login:

- **Locally:** click *Import from this computer* and clevex reads
  `~/.codex/auth.json` (or `$CODEX_HOME/auth.json`).
- **Anywhere:** paste the contents of that file.

**clevex never refreshes imported sessions.** Refreshing would rotate the refresh
token and sign your CLI out. When an imported session expires, run any `codex`
command to refresh it, then import again.

Requests go to `chatgpt.com/backend-api/codex/responses`, the same backend the
Codex CLI uses.

## Claude

Works with **Claude Pro and Max** plans, or with an Anthropic API key.

> **Caveat.** Anthropic's terms limit subscription OAuth tokens to Anthropic's
> own apps, such as Claude.ai and Claude Code. Since early 2026, Anthropic may
> reject these tokens in third-party tools or bill them as extra usage. If
> Claude replies fail with 401 or 403 errors, switch to an API key. Subscription
> sign-in is offered for personal use only.

### Sign in with Claude

clevex uses **Claude Code's public OAuth client** and asks for the
inference-only `user:inference` scope, which is the same long-lived token shape
that `claude setup-token` creates. After you approve, Claude shows a code. Paste
it back into clevex.

### Long-lived token

Run `claude setup-token` in a terminal and paste the `sk-ant-oat…` token. It
lasts a year.

### Import from Claude Code (local only)

clevex reads Claude Code's existing login from the macOS keychain
(`Claude Code-credentials`) or from `~/.claude/.credentials.json`. As with Codex,
clevex never refreshes imported sessions.

### Anthropic API key

Paste an `sk-ant-api…` key. You're billed per token by Anthropic, and the
subscription caveat above doesn't apply. This is the most reliable option.

## Choosing a model

The chat composer has a model picker with GPT and Claude models and a reasoning
effort setting (low / medium / high). ⌘K inline edits use
the same model and effort you picked for chat. The model list is in
`src/lib/ai/models.ts`.

## Server-side and gateway options

Operators can give a deployment its own credentials instead of relying on each
browser:

- `CLAUDE_CODE_OAUTH_TOKEN` lets everyone on the deployment use your Claude plan.
- `CLEVEX_OPENAI_BASE_URL` and `CLEVEX_ANTHROPIC_BASE_URL` route requests through
  an OpenAI Responses-compatible or Anthropic Messages-compatible gateway.

A browser login always wins over these. See [Configuration](configuration.md).
