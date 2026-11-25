import { z } from "zod";

export const createMemberSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),

    password: z
      .string()
      .min(12, "Password must contain at least 12 characters")
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "Password must not exceed 72 bytes"
      ),
  })
  .strict();

export type CreateMemberInput = z.infer<
  typeof createMemberSchema
>;