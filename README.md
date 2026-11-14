<p align="center">
  <img src="assets/icon.svg" width="72" height="72" alt="clevex logo">
</p>

<h1 align="center">clevex</h1>

<p align="center">
  An AI-native LaTeX workspace that runs on the <b>ChatGPT and Claude subscriptions you already pay for</b>.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-d16e3f"></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-131110">
  <img alt="Convex" src="https://img.shields.io/badge/backend-Convex-131110">
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-d16e3f"></a>
</p>

<p align="center">
  <a href="docs/getting-started.md">Getting started</a> ·
  <a href="docs/user-guide.md">User guide</a> ·
  <a href="docs/providers.md">Connecting ChatGPT &amp; Claude</a> ·
  <a href="docs/self-hosting.md">Self-hosting</a> ·
  <a href="docs/architecture.md">Architecture</a>
</p>

![The clevex workspace: file tree, LaTeX editor, live PDF preview and an AI chat that proposes edits as diffs](public/marketing/workspace.jpg)

clevex is an open-source editor for LaTeX papers with an AI collaborator built
in. Write in a real code editor, watch the PDF update next to it, and ask GPT or
Claude to rewrite a paragraph, fix a compile error or find a citation. The model
sees the whole project and proposes changes as diffs you can apply or undo.

It started as a side project at [Cleve](https://www.cleve.ai) and uses the Cleve
design system.

## Local ChatGPT integration prototype

This fork includes an official Sign in with ChatGPT prototype for local use.
ChatGPT tokens stay in protected local runtime storage, and inference uses the
public Responses API. The remaining upstream documentation below describes the
original integration; follow [the prototype guide](docs/chatgpt-local-prototype.md)
for this branch's ChatGPT setup and limitations. Claude integration is unchanged.

## Features

| | |
| --- | --- |
| **Editor** | CodeMirror 6 with LaTeX highlighting, autocomplete for commands, environments, `\ref` labels and `\cite` keys, and compile errors shown inline. |
| **Live PDF** | Compiles on ⌘S or while you type. Uses [Tectonic](https://tectonic-typesetting.github.io/) when it's installed and falls back to a LaTeX-on-HTTP service, so it also works on Vercel. |
| **AI chat** | Sees every file in the project and proposes edits as reviewable diffs. Choose a GPT or Claude model and a reasoning effort. |
| **⌘K inline edits** | Select text, describe the change, then accept or retry. |
| **Fix with AI** | Sends the compile errors and log to the model in one click. |
| **Citations** | Search arXiv and add BibTeX entries to your `.bib` file. |
| **Images → LaTeX** | Paste a photo of a whiteboard or handwritten math into the chat. |
| **And more** | Voice dictation, outline view, word count, multi-file projects, `.zip` import/export, templates (paper, notes, Beamer), light/dark themes, mobile layout. |

**Your subscriptions, your keys.** ChatGPT and Claude credentials stay in your
browser. The server routes are stateless proxies that forward each request with
the caller's own token. Accounts, projects, files and chat history sync through
[Convex](https://convex.dev) with [Better Auth](https://better-auth.com).

## Quick start

You need Node.js 22+, [pnpm](https://pnpm.io) 10, and a free
[Convex](https://convex.dev) account.

```bash
git clone https://github.com/MohtashamMurshid/clevex.git
cd clevex
pnpm install
npx convex dev          # first run: log in, create a project, write .env.local
```

In a second terminal, set the auth variables on your new Convex dev deployment,
then start the app:

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm dev                # http://localhost:3000
```

Create an account, open **Connect** in the top bar and sign in with ChatGPT or
Claude. For faster, private compiles, install Tectonic (`brew install tectonic`).

The [getting started guide](docs/getting-started.md) has the full steps and fixes
for common problems.

## Documentation

| Guide | What's in it |
| --- | --- |
| [Getting started](docs/getting-started.md) | Run clevex locally, step by step |
| [User guide](docs/user-guide.md) | The workspace, AI features, keyboard shortcuts |
| [Connecting ChatGPT & Claude](docs/providers.md) | Every sign-in option and how it works, plus caveats |
| [Self-hosting](docs/self-hosting.md) | Deploy to Vercel with a production Convex deployment |
| [Configuration](docs/configuration.md) | All environment variables |
| [Architecture](docs/architecture.md) | How the pieces fit, data model, request flow |
| [Contributing](CONTRIBUTING.md) | Dev workflow, code style, pull requests |
| [Security](SECURITY.md) | Threat model and how to report a vulnerability |

## A note on subscription tokens

clevex signs in with the same public OAuth clients that the Codex CLI and Claude
Code use. That's what lets it run on a ChatGPT or Claude plan instead of a paid
API key, but **neither OpenAI nor Anthropic officially supports it for
third-party apps**:

- Anthropic's terms limit Claude subscription OAuth tokens to Anthropic's own
  apps. Since early 2026 it may reject them in third-party tools or bill them as
  extra usage. If Claude replies fail, use an Anthropic API key.
- Either provider can change these endpoints without notice.

Use it for personal work and read your plan's terms. If you need something
officially supported, use API keys or the gateway options in
[Configuration](docs/configuration.md#ai-gateways). See
[Connecting ChatGPT & Claude](docs/providers.md) for details.

## Tech stack

[Next.js 16](https://nextjs.org) (App Router) · React 19 ·
[Convex](https://convex.dev) · [Better Auth](https://better-auth.com) ·
[CodeMirror 6](https://codemirror.net) · [PDF.js](https://mozilla.github.io/pdf.js/) ·
[Tailwind CSS 4](https://tailwindcss.com) · [coss ui](https://coss.com/ui) / Base UI ·
[Tectonic](https://tectonic-typesetting.github.io/)

## Contributing

Bug reports, ideas and pull requests are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) first. To report a security problem, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

The code is released under the [MIT License](LICENSE). The Cleve name, logo and
marketing artwork are not covered by it. See
[TRADEMARKS.md](TRADEMARKS.md).

clevex is not affiliated with or endorsed by OpenAI or Anthropic. ChatGPT, Codex,
Claude and Claude Code are trademarks of their respective owners.
