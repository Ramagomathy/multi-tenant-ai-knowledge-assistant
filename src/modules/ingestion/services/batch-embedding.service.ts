// import "server-only";

import type { TextChunk } from "./chunking.service";
import { getEmbeddingProvider } from "./embedding-provider.service";

const BATCH_SIZE = 5;

export interface EmbeddedChunk extends TextChunk {
  embedding: number[];
  embeddingModel: string;
}

export async function embedChunks(
  chunks: TextChunk[]
): Promise<EmbeddedChunk[]> {
  const provider = getEmbeddingProvider();
  const results: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const embeddings = await Promise.all(
      batch.map((chunk) =>
        provider.generateEmbedding(chunk.content)
      )
    );

    batch.forEach((chunk, index) => {
      results.push({
        ...chunk,
        embedding: embeddings[index],
        embeddingModel: provider.model,
      });
    });
  }

  return results;
}