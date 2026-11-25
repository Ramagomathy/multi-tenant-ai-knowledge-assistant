import "server-only";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must contain at least 32 characters"),

  APP_ORIGIN: z.string().url("APP_ORIGIN must be a valid URL"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(50).default(10),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(128).max(3072).default(768),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      "Environment validation failed:",
      result.error.flatten().fieldErrors
    );

    throw new Error("Invalid environment configuration");
  }

  return result.data;
}

export const env = validateEnv();