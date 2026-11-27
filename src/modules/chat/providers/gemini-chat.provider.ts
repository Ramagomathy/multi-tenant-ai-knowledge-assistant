// import "server-only";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

import type {
  ChatProvider,
  ChatGenerationInput,
  ChatStreamEvent,
} from "./chat-provider.types";

interface GeminiInteractionEvent {
  event_type?: string;

  delta?: {
    type?: string;
    text?: string;
  };

  interaction?: {
    usage?: {
      total_input_tokens?: number;
      total_output_tokens?: number;
      total_tokens?: number;
    };
  };

  error?: {
    message?: string;
    code?: string;
  };
}

export class GeminiChatProvider implements ChatProvider {
  async *generateStream(
    input: ChatGenerationInput
  ): AsyncGenerator<ChatStreamEvent> {
    if (!env.GEMINI_API_KEY) {
      throw new AppError(
        "Gemini API key is not configured",
        503
      );
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          model: env.GEMINI_CHAT_MODEL,
          input: input.input,
          system_instruction: input.systemInstruction,
          stream: true,
          store: false,
          generation_config: {
            temperature: 0.2,
            max_output_tokens: 1200,
          },
        }),
        signal: input.signal,
      }
    );

    if (!response.ok) {
      // Do not expose provider response or API key details.
      throw new AppError(
        response.status === 429
          ? "AI provider rate limit reached"
          : "AI provider request failed",
        response.status === 429 ? 429 : 502
      );
    }

    if (!response.body) {
      throw new AppError("AI provider returned an empty stream", 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    const processBlock = (
      block: string
    ): GeminiInteractionEvent | null => {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (!data || data === "[DONE]") {
        return null;
      }

      try {
        return JSON.parse(data) as GeminiInteractionEvent;
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
          const event = processBlock(block);

          if (!event) continue;

          if (event.event_type === "error") {
            throw new AppError(
              "AI generation failed",
              502
            );
          }

          if (
            event.event_type === "step.delta" &&
            event.delta?.type === "text" &&
            event.delta.text
          ) {
            yield {
              type: "text",
              text: event.delta.text,
            };
          }

          if (event.event_type === "interaction.completed") {
            const usage = event.interaction?.usage;

            yield {
              type: "usage",
              inputTokens: usage?.total_input_tokens ?? 0,
              outputTokens: usage?.total_output_tokens ?? 0,
              totalTokens: usage?.total_tokens ?? 0,
            };
          }
        }
      }

      // Process a final event if the stream ended without a trailing blank line.
      if (buffer.trim()) {
        const event = processBlock(buffer);

        if (event?.event_type === "interaction.completed") {
          const usage = event.interaction?.usage;

          yield {
            type: "usage",
            inputTokens: usage?.total_input_tokens ?? 0,
            outputTokens: usage?.total_output_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}