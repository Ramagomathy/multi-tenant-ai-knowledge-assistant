// import "server-only";

import { createHash } from "crypto";
import { connectToDatabase } from "@/lib/db/mongoose";
import { AppError } from "@/lib/errors";
import { RateLimit } from "../models/RateLimit";

interface RateLimitOptions {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
}

export async function enforceRateLimit({
  scope,
  identifier,
  limit,
  windowMs,
}: RateLimitOptions) {
  await connectToDatabase();

  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const windowStart = bucket * windowMs;
  const windowEnd = windowStart + windowMs;

  // Hash identifiers instead of storing raw emails or IP addresses.
  const identifierHash = createHash("sha256")
    .update(identifier.trim().toLowerCase())
    .digest("hex");

  const key = `${scope}:${identifierHash}:${bucket}`;

  const expiresAt = new Date(windowEnd + 24 * 60 * 60 * 1000);

  const record = await RateLimit.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  if (!record) {
    throw new AppError(
      "Unable to process request",
      503,
      "RATE_LIMIT_SERVICE_UNAVAILABLE"
    );
  }

  if (record.count > limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((windowEnd - now) / 1000)
    );

    throw new AppError(
      `Too many requests. Try again in ${retryAfter} seconds.`,
      429,
      "RATE_LIMIT_EXCEEDED"
    );
  }
}