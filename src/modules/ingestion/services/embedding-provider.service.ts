import "server-only";

import type { EmbeddingProvider } from "../types/embedding.types";
import { GeminiEmbeddingProvider } from "./gemini-embedding.service";

let provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!provider) {
    provider = new GeminiEmbeddingProvider();
  }

  return provider;
}