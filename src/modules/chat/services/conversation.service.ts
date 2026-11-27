// import "server-only";

import mongoose, { Types } from "mongoose";

import Conversation from "../models/Conversation";
import Message from "../models/Message";

export async function createConversation(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  title?: string;
}) {
  return Conversation.create({
    organizationId: params.organizationId,
    userId: params.userId,
    title: params.title || "New conversation",
    lastMessageAt: new Date(),
  });
}

export async function listConversations(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
}) {
  return Conversation.find({
    organizationId: params.organizationId,
    userId: params.userId,
  })
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .select("_id title lastMessageAt createdAt")
    .lean();
}

export async function getConversation(params: {
  conversationId: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
}) {
  const conversation = (await Conversation.findOne({
    _id: params.conversationId,
    organizationId: params.organizationId,
    userId: params.userId,
  }).lean()) as { _id: Types.ObjectId } | null;

  if (!conversation) return null;

  const messages = await Message.find({
    conversationId: conversation._id,
    organizationId: params.organizationId,
    userId: params.userId,
  })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  return { conversation, messages };
}

export async function deleteConversation(params: {
  conversationId: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
}) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const conversation = await Conversation.findOneAndDelete(
        {
          _id: params.conversationId,
          organizationId: params.organizationId,
          userId: params.userId,
        },
        { session }
      );

      if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");

      await Message.deleteMany(
        {
          conversationId: conversation._id,
          organizationId: params.organizationId,
          userId: params.userId,
        },
        { session }
      );
    });
    return true;
  } finally {
    await session.endSession();
  }
}
