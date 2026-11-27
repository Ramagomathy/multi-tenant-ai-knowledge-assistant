
import { GroqChatProvider } from "../providers/groq-chat.provider";
import type { ChatProvider } from "../providers/chat-provider.types";

let provider: ChatProvider | null = null;

export function getChatProvider(): ChatProvider {
  if (!provider) {
    provider = new GroqChatProvider();
  }

  return provider;
}
