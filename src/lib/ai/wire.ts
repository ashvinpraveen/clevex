/** Request shape the browser sends to /api/ai/{chatgpt,claude}. */
export type WireMessage = {
  role: "user" | "assistant";
  text: string;
  images?: { mime: string; data: string }[];
};

export type Effort = "low" | "medium" | "high";

export type WireRequest = {
  model: string;
  system: string;
  /** Large, stable context (project files) kept separate so providers can cache it. */
  context?: string;
  messages: WireMessage[];
  effort?: Effort;
  /** Browser-held credential; absent when the server has its own. */
  auth?:
    | { kind: "chatgpt-local" }
    | { kind: "claude-oauth"; accessToken: string }
    | { kind: "anthropic-key"; apiKey: string };
  sessionId?: string;
};
