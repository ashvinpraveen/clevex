/** Next.js may canonicalize request.url to localhost; browser origin uses Host. */
export function requireLocalChatGPT(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host") || "";
  const validHost = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host);
  if (
    process.env.CLEVEX_CHATGPT_LOCAL !== "1" ||
    process.env.VERCEL ||
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !validHost ||
    req.headers.get("x-clevex") !== "1" ||
    (req.headers.has("origin") &&
      req.headers.get("origin") !== `http://${host}`) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new Error(
      "ChatGPT plan usage requires CLEVEX_CHATGPT_LOCAL=1 on your own machine.",
    );
  }
}
