// import "server-only";

import mongoose, { Schema } from "mongoose";

const DocumentSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    originalName: {
      type: String,
      required: true,
      maxlength: 255,
    },

    mimeType: {
      type: String,
      required: true,
      enum: [
        "application/pdf",
        "text/plain",
        "text/markdown",
      ],
    },

    size: {
      type: Number,
      required: true,
      min: 1,
    },

    sha256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },

    storageId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "uploaded",
        "queued",
        "processing",
        "ready",
        "failed",
        "deleting",
      ],
      default: "uploaded",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate content inside the same organization.
DocumentSchema.index(
  { organizationId: 1, sha256: 1 },
  { unique: true, name: "uniq_org_document_sha256" }
);

// Efficient organization-scoped listing.
DocumentSchema.index({
  organizationId: 1,
  createdAt: -1,
});

export const Document =
  mongoose.models.Document ||
  mongoose.model("Document", DocumentSchema);