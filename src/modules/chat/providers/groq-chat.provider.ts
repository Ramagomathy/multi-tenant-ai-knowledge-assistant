
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

import type {
  ChatProvider,
  ChatGenerationInput,
  ChatStreamEvent,
} from "./chat-provider.types";

interface GroqStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;

  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };

  error?: {
    message?: string;
  };
}

export class GroqChatProvider implements ChatProvider {
  async *generateStream(
    input: ChatGenerationInput
  ): AsyncGenerator<ChatStreamEvent> {
    if (!env.GROQ_API_KEY) {
      throw new AppError("Groq API key is not configured", 503);
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.GROQ_CHAT_MODEL,
          messages: [
            {
              role: "system",
              content: input.systemInstruction,
            },
            {
              role: "user",
              content: input.input,
            },
          ],
          temperature: 0.2,
          max_completion_tokens: 1200,
          stream: true,
          stream_options: {
            include_usage: true,
          },
        }),
        signal: input.signal,
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);

      console.error("[GROQ HTTP ERROR]", {
        status: response.status,
        message: errorBody?.error?.message,
        model: env.GROQ_CHAT_MODEL,
      });

      if (response.status === 429) {
        throw new AppError("Groq rate limit reached", 429);
      }

      if (response.status === 503 || response.status === 502) {
        throw new AppError("Groq service temporarily unavailable", 503);
      }

      throw new AppError("Groq provider request failed", 502);
    }

    if (!response.body) {
      throw new AppError("Groq returned an empty stream", 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    const processBlock = (block: string): GroqStreamChunk | null => {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (!data || data === "[DONE]") {
        return null;
      }

      try {
        return JSON.parse(data) as GroqStreamChunk;
      } catch {
        return null;
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const chunk = processBlock(block);

          if (!chunk) continue;

          if (chunk.error) {
            throw new AppError("Groq generation failed", 502);
          }

          const text = chunk.choices?.[0]?.delta?.content;

          if (text) {
            yield {
              type: "text",
              text,
            };
          }

          if (chunk.usage) {
            yield {
              type: "usage",
              inputTokens: chunk.usage.prompt_tokens ?? 0,
              outputTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens: chunk.usage.total_tokens ?? 0,
            };
          }
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        const chunk = processBlock(buffer);

        if (chunk?.usage) {
          yield {
            type: "usage",
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
