// import "server-only";

import { createHash } from "crypto";

import ChatRateLimit from "../models/ChatRateLimit";

const CHAT_LIMIT = 10;
const WINDOW_MS = 60 * 1000;

function createRateLimitKey(
  organizationId: string,
  userId: string
) {
  return createHash("sha256")
    .update(`${organizationId}:${userId}`)
    .digest("hex");
}

export async function consumeChatRateLimit(params: {
  organizationId: string;
  userId: string;
}) {
  const key = createRateLimitKey(
    params.organizationId,
    params.userId
  );

  const now = new Date();
  const resetAt = new Date(now.getTime() + WINDOW_MS);

  // Normal request within an active window.
  const existing = await ChatRateLimit.findOneAndUpdate(
    {
      key,
      resetAt: { $gt: now },
      count: { $lt: CHAT_LIMIT },
    },
    {
      $inc: { count: 1 },
    },
    { new: true }
  );

  if (existing) {
    return {
      allowed: true,
      remaining: Math.max(0, CHAT_LIMIT - existing.count),
      resetAt: existing.resetAt,
    };
  }

  // Expired window: reset it atomically.
  const expired = await ChatRateLimit.findOneAndUpdate(
    {
      key,
      resetAt: { $lte: now },
    },
    {
      $set: {
        count: 1,
        resetAt,
      },
    },
    { new: true }
  );

  if (expired) {
    return {
      allowed: true,
      remaining: CHAT_LIMIT - 1,
      resetAt: expired.resetAt,
    };
  }

  // First request for this user.
  try {
    const created = await ChatRateLimit.create({
      key,
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      remaining: CHAT_LIMIT - 1,
      resetAt: created.resetAt,
    };
  } catch (error: any) {
    // A concurrent request may have created the record.
    if (error?.code !== 11000) throw error;
  }

  const current = await ChatRateLimit.findOne({ key }).lean();

  if (!current || current.resetAt <= now) {
    // Retry once if the window expired during the race.
    return consumeChatRateLimit(params);
  }

  return {
    allowed: false,
    remaining: 0,
    resetAt: current.resetAt,
  };
}