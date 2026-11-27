// import "server-only";

import type { Types } from "mongoose";
import { Document } from "@/modules/documents/models/Documents";
import { DocumentChunk } from "@/modules/ingestion/models/DocumentChunk";
import type { RetrievalCandidate } from "../types/retrieval.types";

export async function retrieveByKeyword(params: {
  organizationId: Types.ObjectId;
  query: string;
  topK: number;
}): Promise<RetrievalCandidate[]> {
  const chunks = await DocumentChunk.find({
    organizationId: params.organizationId,
    $text: { $search: params.query },
  })
    .select({ _id: 1, documentId: 1, chunkIndex: 1, content: 1, tokenCount: 1, score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" } })
    .limit(params.topK)
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
  return chunks
    .filter((chunk) => documentMap.has(String(chunk.documentId)))
    .map((chunk) => ({
      chunkId: chunk._id as Types.ObjectId,
      documentId: chunk.documentId as Types.ObjectId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      documentName: documentMap.get(String(chunk.documentId))!,
      score: chunk.score ?? 0,
      keywordScore: chunk.score ?? 0,
    }));
}
