// import "server-only";

import type { Types } from "mongoose";
import { Document } from "@/modules/documents/models/Documents";
import { DocumentChunk } from "@/modules/ingestion/models/DocumentChunk";
import { getEmbeddingProvider } from "@/modules/ingestion/services/embedding-provider.service";
import { cosineSimilarity } from "./cosine-similarity.service";
import type { RetrievalCandidate } from "../types/retrieval.types";

const MAX_VECTOR_CANDIDATES = 5000;
const MIN_VECTOR_SIMILARITY = 0.35;

export async function retrieveByVector(params: {
  organizationId: Types.ObjectId;
  query: string;
  topK: number;
}): Promise<RetrievalCandidate[]> {
  const provider = getEmbeddingProvider();
  const queryEmbedding = await provider.generateEmbedding(params.query);
  if (queryEmbedding.length !== provider.dimensions) {
    throw new Error("Query embedding dimensions do not match provider");
  }

  const chunks = await DocumentChunk.find({
    organizationId: params.organizationId,
    embeddingModel: provider.model,
    embedding: { $exists: true, $ne: [] },
  })
    .select({ _id: 1, documentId: 1, chunkIndex: 1, content: 1, tokenCount: 1, embedding: 1 })
    .sort({ documentId: 1, chunkIndex: 1 })
    .limit(MAX_VECTOR_CANDIDATES)
    .lean();
  if (chunks.length === 0) return [];

  const documentIds = [...new Set(chunks.map((chunk) => String(chunk.documentId)))];
  const documents = await Document.find({
    _id: { $in: documentIds },
    organizationId: params.organizationId,
    status: "ready",
  })
    .select({ _id: 1, originalName: 1 })
    .lean();
  const documentMap = new Map(documents.map((document) => [String(document._id), document.originalName]));

  const results: RetrievalCandidate[] = [];
  for (const chunk of chunks) {
    const documentName = documentMap.get(String(chunk.documentId));
    if (!documentName) continue;
    const embedding = chunk.embedding as number[];
    if (embedding.length !== queryEmbedding.length) continue;
    const score = cosineSimilarity(queryEmbedding, embedding);
    if (score < MIN_VECTOR_SIMILARITY) continue;

    results.push({
      chunkId: chunk._id as Types.ObjectId,
      documentId: chunk.documentId as Types.ObjectId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      documentName,
      score,
      vectorScore: score,
    });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, params.topK);
}
