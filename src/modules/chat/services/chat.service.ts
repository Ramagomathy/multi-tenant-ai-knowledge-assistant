// import "server-only";

import { Types } from "mongoose";

import Message from "../models/Message";
import Conversation from "../models/Conversation";

import { getChatProvider } from "./chat-provider.service";
import { retrieveDocuments } from "@/modules/retrieval/services/retrieval.service";
import {
  buildChatPrompt,
  buildCitationList,
  hasSufficientEvidence,
  sanitizeCitationMarkers,
} from "./chat-prompt.service";
import type { ChatStreamEvent } from "../providers/chat-provider.types";
import {
  reserveQuota,
  settleQuota,
  cancelQuota,
} from "@/modules/usage/services/quota.service";
import {
  getCachedAnswer,
  saveCachedAnswer,
} from "@/modules/usage/services/usage-cache.service";
import { env } from "@/lib/env";

const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 6000;
const MAX_CONTEXT_CHARS = 9000;

export interface ChatExecution {
  conversationId: Types.ObjectId;
  userMessageId: Types.ObjectId;
  assistantMessageId: Types.ObjectId;
  citations: ReturnType<typeof buildCitationList>;
  stream: AsyncGenerator<ChatStreamEvent>;
}

export async function prepareChat(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  conversationId?: string;
  message: string;
  signal: AbortSignal;
  requestId: string;
  reservationId?: Types.ObjectId;
}): Promise<ChatExecution> {
  let conversation;

  if (params.conversationId) {
    conversation = await Conversation.findOne({
      _id: params.conversationId,
      organizationId: params.organizationId,
      userId: params.userId,
    });
    if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
  } else {
    conversation = await Conversation.create({
      organizationId: params.organizationId,
      userId: params.userId,
      title: params.message.slice(0, 70),
      lastMessageAt: new Date(),
    });
  }

  const history = await Message.find({
    conversationId: conversation._id,
    organizationId: params.organizationId,
    userId: params.userId,
    role: { $in: ["user", "assistant"] },
    status: "completed",
  })
    .sort({ createdAt: -1 })
    .limit(MAX_HISTORY_MESSAGES)
    .select("role content")
    .lean();

  const orderedHistory = history.reverse();
  let remainingHistoryChars = MAX_HISTORY_CHARS;
  const limitedHistory: Array<{ role: string; content: string }> = [];

  for (const message of orderedHistory) {
    if (remainingHistoryChars <= 0) break;
    const content = message.content.slice(0, remainingHistoryChars);
    remainingHistoryChars -= content.length;
    limitedHistory.push({ role: message.role, content });
  }

  const cached = await getCachedAnswer({
    organizationId: params.organizationId,
    question: params.message,
  });

  if (cached) {
    const cachedAnswer = cached.answer;
    const cachedCitations = cached.citations as ReturnType<typeof buildCitationList>;
    const userMessage = await Message.create({
      conversationId: conversation._id,
      organizationId: params.organizationId,
      userId: params.userId,
      role: "user",
      content: params.message,
      status: "completed",
    });
    const assistantMessage = await Message.create({
      conversationId: conversation._id,
      organizationId: params.organizationId,
      userId: params.userId,
      role: "assistant",
      content: cachedAnswer,
      status: "completed",
      citations: cachedCitations,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });

    await Conversation.updateOne(
      {
        _id: conversation._id,
        organizationId: params.organizationId,
        userId: params.userId,
      },
      { $set: { lastMessageAt: new Date() } }
    );

    async function* cachedStream(): AsyncGenerator<ChatStreamEvent> {
      yield { type: "text", text: cachedAnswer };
      yield { type: "usage", inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }

    return {
      conversationId: conversation._id,
      userMessageId: userMessage._id,
      assistantMessageId: assistantMessage._id,
      citations: cachedCitations,
      stream: cachedStream(),
    };
  }

  const retrieval = await retrieveDocuments({
    organizationId: params.organizationId,
    query: params.message,
    topK: 6,
  });

  let remainingContextChars = MAX_CONTEXT_CHARS;
  const sources = retrieval.results
    .map((result) => {
      const content = result.content.slice(0, remainingContextChars);
      remainingContextChars -= content.length;
      return { ...result, content };
    })
    .filter((result) => result.content.length > 0);

  const userMessage = await Message.create({
    conversationId: conversation._id,
    organizationId: params.organizationId,
    userId: params.userId,
    role: "user",
    content: params.message,
    status: "completed",
  });
  const citations = buildCitationList(sources);
  const assistantMessage = await Message.create({
    conversationId: conversation._id,
    organizationId: params.organizationId,
    userId: params.userId,
    role: "assistant",
    content: "",
    status: "streaming",
    citations,
  });

  await Conversation.updateOne(
    { _id: conversation._id, organizationId: params.organizationId },
    { $set: { lastMessageAt: new Date() } }
  );

  if (!hasSufficientEvidence(sources)) {
    async function* abstentionStream(): AsyncGenerator<ChatStreamEvent> {
      const answer = "I couldn't find sufficient information in the available documents.";
      await Message.updateOne(
        { _id: assistantMessage._id },
        { $set: { content: answer, status: "completed" } }
      );
      yield { type: "text", text: answer };
      yield { type: "usage", inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }

    return {
      conversationId: conversation._id,
      userMessageId: userMessage._id,
      assistantMessageId: assistantMessage._id,
      citations: [],
      stream: abstentionStream(),
    };
  }

  const prompt = buildChatPrompt({ question: params.message, history: limitedHistory, sources });
  const estimatedTokens =
    Math.ceil((prompt.systemInstruction.length + prompt.input.length) / 4) + 1200;

  let reservation: Awaited<ReturnType<typeof reserveQuota>>;
  try {
    reservation = await reserveQuota({
      organizationId: params.organizationId,
      userId: params.userId,
      requestId: params.requestId,
      estimatedTokens,
    });
  } catch (error) {
    await Message.updateOne(
      { _id: assistantMessage._id },
      {
        $set: {
          status: "failed",
          errorCode:
            error instanceof Error && error.message === "QUOTA_EXCEEDED"
              ? "QUOTA_EXCEEDED"
              : "RESERVATION_FAILED",
        },
      }
    );
    throw error;
  }

  const provider = getChatProvider();

  async function* generate(): AsyncGenerator<ChatStreamEvent> {
    let fullResponse = "";
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let reservationProcessed = false;

    try {
      for await (const event of provider.generateStream({
        systemInstruction: prompt.systemInstruction,
        input: prompt.input,
        signal: params.signal,
      })) {
        if (event.type === "text") {
          fullResponse += event.text;
          yield event;
        } else {
          usage = {
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            totalTokens: event.totalTokens,
          };
          yield event;
        }
      }

      const validIds = citations.map((citation) => citation.citationId);
      fullResponse = sanitizeCitationMarkers(fullResponse, validIds);
      const actualTokens =
        usage.totalTokens > 0
          ? usage.totalTokens
          : Math.ceil(
              (prompt.systemInstruction.length + prompt.input.length + fullResponse.length) / 4
            );

      await settleQuota({
        reservationId: reservation._id,
        organizationId: params.organizationId,
        userId: params.userId,
        actualTokens,
      });
      reservationProcessed = true;

      await Message.updateOne(
        {
          _id: assistantMessage._id,
          organizationId: params.organizationId,
          userId: params.userId,
        },
        { $set: { content: fullResponse, status: "completed", tokenUsage: usage } }
      );

      if (fullResponse.trim()) {
        await saveCachedAnswer({
          organizationId: params.organizationId,
          question: params.message,
          answer: fullResponse,
          citations,
          model: env.GROQ_CHAT_MODEL,
        });
      }
    } catch (error) {
      console.error("[CHAT GENERATION ERROR]", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      const aborted = params.signal.aborted;

      if (!reservationProcessed) {
        try {
          if (fullResponse.trim()) {
            await settleQuota({
              reservationId: reservation._id,
              organizationId: params.organizationId,
              userId: params.userId,
              actualTokens: reservation.estimatedTokens,
            });
          } else {
            await cancelQuota({
              reservationId: reservation._id,
              organizationId: params.organizationId,
              userId: params.userId,
            });
          }
          reservationProcessed = true;
        } catch {
          // Preserve the original generation error; quota can be reconciled later.
        }
      }

      await Message.updateOne(
        {
          _id: assistantMessage._id,
          organizationId: params.organizationId,
          userId: params.userId,
        },
        {
          $set: {
            content: fullResponse,
            status: aborted ? "cancelled" : "failed",
            errorCode: aborted ? "CANCELLED" : "GENERATION_FAILED",
            tokenUsage: usage,
          },
        }
      );
      throw error;
    }
  }

  return {
    conversationId: conversation._id,
    userMessageId: userMessage._id,
    assistantMessageId: assistantMessage._id,
    citations,
    stream: generate(),
  };
}
