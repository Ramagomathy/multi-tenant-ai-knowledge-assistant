import type { Types } from "mongoose";

export interface ChatCitation {
  citationId: string;
  documentId: Types.ObjectId;
  chunkId: Types.ObjectId;
  documentName: string;
  chunkIndex: number;
}

export interface ChatTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ChatContext {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  conversationId: Types.ObjectId;
}