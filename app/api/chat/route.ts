import { NextRequest } from "next/server";

import { requireAuth } from "@/modules/auth/utils/auth";
import { validateRequestOrigin } from "@/lib/security/csrf";
import { handleApiError } from "@/lib/errors";

import { chatSchema } from "@/modules/chat/schemas/chat.schema";
import { prepareChat } from "@/modules/chat/services/chat.service";

import Message from "@/modules/chat/models/Message";
import { consumeChatRateLimit } from "@/modules/usage/services/chat-rate-limit.service";

function createSSEStream(params: {
  conversationId: string;
  assistantMessageId: string;
  citations: unknown[];
  stream: AsyncGenerator<any>;
  signal: AbortSignal;
  abortController: AbortController;
}) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          )
        );
      };

      let fullText = "";

      try {
        send("meta", {
          conversationId: params.conversationId,
          assistantMessageId: params.assistantMessageId,
        });

        send("citations", {
          citations: params.citations,
        });

        for await (const item of params.stream) {
          if (params.signal.aborted) {
            throw new Error("CANCELLED");
          }

          if (item.type === "text") {
            fullText += item.text;

            send("token", {
              text: item.text,
            });
          }

          if (item.type === "usage") {
            send("usage", {
              inputTokens: item.inputTokens,
              outputTokens: item.outputTokens,
              totalTokens: item.totalTokens,
            });
          }
        }

        send("done", {
          conversationId: params.conversationId,
          assistantMessageId: params.assistantMessageId,
        });
      } catch (error) {
        const cancelled = params.signal.aborted;

        if (!cancelled) {
          send("error", {
            message: "Unable to complete the response.",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The client may already have disconnected.
        }
      }
    },

    cancel() {
      params.abortController.abort();
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    validateRequestOrigin(request);

    const auth = await requireAuth();

    const body = await request.json();
    const input = chatSchema.parse(body);
    const rateLimit = await consumeChatRateLimit({
  organizationId: String(auth.organizationId),
  userId: String(auth.userId),
});

if (!rateLimit.allowed) {
  return Response.json(
    {
      error: "Too many chat requests. Please try again shortly.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(
            1,
            Math.ceil(
              (rateLimit.resetAt.getTime() - Date.now()) / 1000
            )
          )
        ),
      },
    }
  );
}

    const abortController = new AbortController();

    request.signal.addEventListener(
      "abort",
      () => abortController.abort(),
      { once: true }
    );

    const execution = await prepareChat({
  organizationId: auth.organizationId,
  userId: auth.userId,
  conversationId: input.conversationId,
  requestId: input.requestId,
  message: input.message,
  signal: abortController.signal,
});

    const stream = createSSEStream({
      conversationId: String(execution.conversationId),
      assistantMessageId: String(execution.assistantMessageId),
      citations: execution.citations,
      stream: execution.stream,
      signal: abortController.signal,
      abortController,
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "CONVERSATION_NOT_FOUND"
    ) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return handleApiError(error);
  }
}