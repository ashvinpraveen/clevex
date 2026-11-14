import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { isLocalRequest } from "@/lib/server/env";

export const runtime = "nodejs";

/**
 * Local-only: read the logins that the Codex CLI and Claude Code already have
 * on this machine so the user can reuse them with one click. Disabled on
 * Vercel and for any non-localhost Host header. Requires a custom header so a
 * cross-origin page can't trigger it without a CORS preflight.
 */
export async function GET(req: Request) {
  if (!isLocalRequest(req) || req.headers.get("x-clevex") !== "1") {
    return Response.json(
      { error: "Only available when clevex runs on your own machine." },
      { status: 403 },
    );
  }
  const provider = new URL(req.url).searchParams.get("provider");

  if (provider === "chatgpt") {
    return Response.json(
      {
        error:
          "Use Continue with ChatGPT. Codex credential import is no longer supported.",
      },
      { status: 410 },
    );
  }

  if (provider === "claude") {
    const fromKeychain = await new Promise<string | null>((resolve) => {
      if (process.platform !== "darwin") return resolve(null);
      execFile(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { timeout: 5000 },
        (err, out) => resolve(err ? null : String(out).trim()),
      );
    });
    const candidates = [fromKeychain];
    try {
      candidates.push(
        await readFile(
          path.join(homedir(), ".claude", ".credentials.json"),
          "utf8",
        ),
      );
    } catch {
      /* none */
    }
    for (const raw of candidates) {
      if (!raw) continue;
      try {
        const j = JSON.parse(raw);
        if (j?.claudeAiOauth?.accessToken)
          return Response.json({
            raw: JSON.stringify({ claudeAiOauth: j.claudeAiOauth }),
          });
      } catch {
        /* skip */
      }
    }
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      return Response.json({ raw: process.env.CLAUDE_CODE_OAUTH_TOKEN });
    }
    return Response.json(
      {
        error:
          "No Claude Code login found on this machine. Run `claude setup-token` and paste the token, or use Sign in with Claude.",
      },
      { status: 404 },
    );
  }

  return Response.json({ error: "Unknown provider" }, { status: 400 });
}
