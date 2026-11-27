import mongoose, { Schema } from "mongoose";

const CitationSchema = new Schema(
  {
    citationId: { type: String, required: true },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentChunk",
      required: true,
    },
    documentName: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },

    content: {
      type: String,
      required: true,
      maxlength: 30000,
    },

    status: {
      type: String,
      enum: ["completed", "streaming", "failed", "cancelled"],
      default: "completed",
    },

    citations: {
      type: [CitationSchema],
      default: [],
    },

    tokenUsage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },

    errorCode: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

MessageSchema.index({
  organizationId: 1,
  conversationId: 1,
  createdAt: 1,
});

export default mongoose.models.Message ||
  mongoose.model("Message", MessageSchema);