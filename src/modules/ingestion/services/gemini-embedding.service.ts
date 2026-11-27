// import "server-only";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { EmbeddingProvider } from "../types/embedding.types";

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0)
  );

  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Invalid embedding vector");
  }

  return values.map((value) => value / magnitude);
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly model = env.GEMINI_EMBEDDING_MODEL;
  readonly dimensions = env.EMBEDDING_DIMENSIONS;

  async generateEmbedding(text: string): Promise<number[]> {
    if (!env.GEMINI_API_KEY) {
      throw new AppError(
        "Gemini API key is not configured",
        503,
        "EMBEDDING_PROVIDER_NOT_CONFIGURED"
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          model: `models/${this.model}`,
          content: {
            parts: [{ text }],
          },
          outputDimensionality: this.dimensions,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      const status = response.status;

      // Avoid returning provider error bodies or API-key details.
      throw new AppError(
        status === 429
          ? "Embedding provider rate limit reached"
          : "Embedding generation failed",
        status === 429 ? 503 : 502,
        status === 429
          ? "EMBEDDING_RATE_LIMITED"
          : "EMBEDDING_PROVIDER_ERROR"
      );
    }

    const result =
      (await response.json()) as GeminiEmbeddingResponse;

    const values = result.embedding?.values;

    if (
      !values ||
      values.length !== this.dimensions ||
      !values.every(Number.isFinite)
    ) {
      throw new Error("Embedding provider returned an invalid vector");
    }

    return normalizeVector(values);
  }
}