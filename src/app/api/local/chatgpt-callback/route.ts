import {
  disconnectLocal,
  localModels,
  localSession,
  requireLocalChatGPT,
  selectLocalProfile,
  serialize,
  startLocalSignIn,
} from "@/lib/server/chatgpt-local";
export const runtime = "nodejs";
const headers = { "cache-control": "no-store" };
export async function GET(req: Request) {
  try {
    requireLocalChatGPT(req);
    const session = await serialize(localSession);
    return Response.json(session, { headers });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Local ChatGPT unavailable.",
      },
      { status: 403, headers },
    );
  }
}
export async function POST(req: Request) {
  try {
    requireLocalChatGPT(req);
  } catch {
    return Response.json(
      {
        error:
          "Run Clevex locally with CLEVEX_CHATGPT_LOCAL=1 to connect ChatGPT.",
      },
      { status: 403, headers },
    );
  }
  try {
    const body = (await req.json()) as {
      action?: string;
      profileId?: string;
      newProfile?: boolean;
    };
    const result = await serialize(async () => {
      switch (body.action) {
        case "start":
          return startLocalSignIn(body.newProfile === true);
        case "disconnect":
          await disconnectLocal();
          return localSession();
        case "select":
          await selectLocalProfile(body.profileId || "");
          return localSession();
        case "models":
          return { models: await localModels() };
        default:
          throw new Error("Unknown ChatGPT action.");
      }
    });
    return Response.json(result, { headers });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "ChatGPT operation failed.",
      },
      { status: 400, headers },
    );
  }
}
