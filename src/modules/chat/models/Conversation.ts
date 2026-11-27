import mongoose, { Schema } from "mongoose";

const ConversationSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      maxlength: 100,
      default: "New conversation",
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

ConversationSchema.index({
  organizationId: 1,
  userId: 1,
  lastMessageAt: -1,
});

export default mongoose.models.Conversation ||
  mongoose.model("Conversation", ConversationSchema);