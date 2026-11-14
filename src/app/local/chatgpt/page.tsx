import { notFound } from "next/navigation";
import { LocalChatGPTConnect } from "./connect";

/** Connection entry point also works before a Convex workspace is configured. */
export default function LocalChatGPTPage() {
  if (process.env.CLEVEX_CHATGPT_LOCAL !== "1" || process.env.VERCEL)
    notFound();
  return <LocalChatGPTConnect />;
}
