import "server-only";

import mongoose, { Schema } from "mongoose";

const DocumentChunkSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },

    content: {
      type: String,
      required: true,
    },

    tokenCount: {
      type: Number,
      required: true,
      min: 0,
    },

    embedding: {
      type: [Number],
      default: undefined,
    },

    embeddingModel: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

DocumentChunkSchema.index(
  { documentId: 1, chunkIndex: 1 },
  { unique: true, name: "uniq_document_chunk_index" }
);

DocumentChunkSchema.index({
  organizationId: 1,
  documentId: 1,
});

export const DocumentChunk =
  mongoose.models.DocumentChunk ||
  mongoose.model("DocumentChunk", DocumentChunkSchema);