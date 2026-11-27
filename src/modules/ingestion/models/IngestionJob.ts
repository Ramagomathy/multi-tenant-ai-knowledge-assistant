// import "server-only";

import mongoose, { Schema } from "mongoose";

const IngestionJobSchema = new Schema(
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

    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
    },

    availableAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    lockedAt: {
      type: Date,
      default: null,
    },

    lockedBy: {
      type: String,
      default: null,
    },

    lastError: {
      type: String,
      default: null,
      maxlength: 1000,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

IngestionJobSchema.index(
  { documentId: 1 },
  { unique: true, name: "uniq_ingestion_job_document" }
);

IngestionJobSchema.index(
  { status: 1, availableAt: 1, createdAt: 1 }
);

IngestionJobSchema.index(
  { status: 1, lockedAt: 1 }
);

IngestionJobSchema.index(
  { organizationId: 1, createdAt: -1 }
);

export const IngestionJob =
  mongoose.models.IngestionJob ||
  mongoose.model("IngestionJob", IngestionJobSchema);