import "server-only";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
});

function validateEnv() {
  console.log("accessed uri")
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