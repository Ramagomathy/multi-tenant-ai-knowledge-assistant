import mongoose, { Schema } from "mongoose";

const ChatRateLimitSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },

    count: {
      type: Number,
      default: 0,
    },

    resetAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

ChatRateLimitSchema.index(
  { resetAt: 1 },
  { expireAfterSeconds: 0 }
);

export default mongoose.models.ChatRateLimit ||
  mongoose.model("ChatRateLimit", ChatRateLimitSchema);