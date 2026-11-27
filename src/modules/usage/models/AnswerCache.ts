import mongoose, { Schema } from "mongoose";

const AnswerCacheSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    knowledgeVersion: {
      type: Number,
      required: true,
    },

    cacheKey: {
      type: String,
      required: true,
    },

    question: {
      type: String,
      required: true,
    },

    answer: {
      type: String,
      required: true,
    },

    citations: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    model: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

AnswerCacheSchema.index(
  {
    organizationId: 1,
    knowledgeVersion: 1,
    cacheKey: 1,
  },
  {
    unique: true,
    name: "uniq_org_version_cache",
  }
);

AnswerCacheSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export default mongoose.models.AnswerCache ||
  mongoose.model("AnswerCache", AnswerCacheSchema);