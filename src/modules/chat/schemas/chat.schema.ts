export const chatSchema = z
  .object({
    conversationId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),

    requestId: z.string().uuid(),

    message: z
      .string()
      .trim()
      .min(2)
      .max(4000),
  })
  .strict();