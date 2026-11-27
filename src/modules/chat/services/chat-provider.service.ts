// import "server-only";

import { GeminiChatProvider } from "../providers/gemini-chat.provider";

import type { ChatProvider } from "../providers/chat-provider.types";

let provider: ChatProvider | null = null;
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "final"; text: string }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };

export function getChatProvider(): ChatProvider {
  if (!provider) {
    provider = new GeminiChatProvider();
  }

  return provider;
}
