import { z } from "zod";

export const retrievalSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(3, "Query must contain at least 3 characters")
      .max(2000, "Query cannot exceed 2000 characters"),

    topK: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5),
  })
  .strict();

export type RetrievalInput = z.infer<typeof retrievalSchema>;