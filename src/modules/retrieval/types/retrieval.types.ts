import type { Types } from "mongoose";

export interface RetrievalContext {
  organizationId: Types.ObjectId;
  query: string;
  topK: number;
}

export interface RetrievalCandidate {
  chunkId: Types.ObjectId;
  documentId: Types.ObjectId;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  documentName: string;
  score: number;
  vectorScore?: number;
keywordScore?: number;
}

export interface RetrievalResult {
  query: string;
  results: RetrievalCandidate[];
  totalResults: number;
}