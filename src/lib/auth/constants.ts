/** Official ChatGPT plan usage endpoints; Claude configuration is unchanged. */
export const CHATGPT = {
  issuer: "https://auth.openai.com",
  authorizeUrl: "https://auth.openai.com/api/accounts/authorize",
  tokenUrl: "https://auth.openai.com/api/accounts/oauth/token",
  scope:
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
  apiBase: "https://api.openai.com/v1",
} as const;

export const CLAUDE = {
  authorizeUrl: "https://claude.com/cai/oauth/authorize",
  tokenUrl: "https://platform.claude.com/v1/oauth/token",
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  redirectUri: "https://platform.claude.com/oauth/code/callback",
  /** Inference-only, long-lived token — the same shape `claude setup-token` creates. */
  scope: "user:inference",
  longLivedSeconds: 365 * 24 * 60 * 60,
  apiBase: "https://api.anthropic.com",
  oauthBeta: "oauth-2025-04-20",
  identity: "You are Claude Code, Anthropic's official CLI for Claude.",
} as const;
