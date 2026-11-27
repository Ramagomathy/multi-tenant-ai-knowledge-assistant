// import "server-only";

import { createHash } from "crypto";
import ChatRateLimit from "../models/ChatRateLimit";

const CHAT_LIMIT = 10;
const WINDOW_MS = 60 * 1000;

function createRateLimitKey(organizationId: string, userId: string) {
  return createHash("sha256").update(`${organizationId}:${userId}`).digest("hex");
}

export async function consumeChatRateLimit(params: {
  organizationId: string;
  userId: string;
}) {
  const key = createRateLimitKey(params.organizationId, params.userId);
  const now = new Date();
  const resetAt = new Date(now.getTime() + WINDOW_MS);

  const existing = await ChatRateLimit.findOneAndUpdate(
    { key, resetAt: { $gt: now }, count: { $lt: CHAT_LIMIT } },
    { $inc: { count: 1 } },
    { new: true }
  );
  if (existing) {
    return { allowed: true, remaining: Math.max(0, CHAT_LIMIT - existing.count), resetAt: existing.resetAt };
  }

  const expired = await ChatRateLimit.findOneAndUpdate(
    { key, resetAt: { $lte: now } },
    { $set: { count: 1, resetAt } },
    { new: true }
  );
  if (expired) return { allowed: true, remaining: CHAT_LIMIT - 1, resetAt: expired.resetAt };

  try {
    const created = await ChatRateLimit.create({ key, count: 1, resetAt });
    return { allowed: true, remaining: CHAT_LIMIT - 1, resetAt: created.resetAt };
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 11000) throw error;
  }

  const current = (await ChatRateLimit.findOne({ key }).lean()) as { resetAt: Date } | null;
  if (!current || current.resetAt <= now) return consumeChatRateLimit(params);
  return { allowed: false, remaining: 0, resetAt: current.resetAt };
}
