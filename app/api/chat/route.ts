console.log("🔥 CHAT ROUTE MODULE LOADED - ORIGINAL VERSION");
import { NextRequest } from "next/server";

import { requireAuth } from "@/modules/auth/utils/auth";
import { validateRequestOrigin } from "@/lib/security/csrf";
import { handleApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/mongodb/object-id";

import { chatSchema } from "@/modules/chat/schemas/chat.schema";
import { prepareChat } from "@/modules/chat/services/chat.service";
import { consumeChatRateLimit } from "@/modules/usage/services/chat-rate-limit.service";

type StreamChunk =
  | { type: "text"; text: string }
  | {
      type: "usage";
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };

interface CreateSSEStreamParams {
  conversationId: string;
  assistantMessageId: string;
  citations: unknown[];
  stream: AsyncGenerator<StreamChunk>;
  signal: AbortSignal;
  abortController: AbortController;
  onCleanup?: () => void;
}

const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function createSSEStream({
  conversationId,
  assistantMessageId,
  citations,
  stream,
  signal,
  abortController,
  onCleanup,
}: CreateSSEStreamParams): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let isClosed = false;

      const send = (event: string, data: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          isClosed = true;
        }
      };

      try {
        send("meta", { conversationId, assistantMessageId });
        send("citations", { citations });

        for await (const item of stream) {
          if (signal.aborted) throw new Error("CANCELLED");

          if (item.type === "text") {
            send("token", { text: item.text });
          } else if (item.type === "usage") {
            send("usage", {
              inputTokens: item.inputTokens,
              outputTokens: item.outputTokens,
              totalTokens: item.totalTokens,
            });
          }
        }

        send("done", { conversationId, assistantMessageId });
      } catch (error) {
        console.error("[CHAT SSE ERROR]", error);

        if (!signal.aborted) {
          send("error", { message: "Unable to complete the response." });
        }
      } finally {
        onCleanup?.();
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {
            // The client may already have disconnected.
          }
        }
      }
    },

    cancel() {
      abortController.abort();
      onCleanup?.();
    },
  });
}

function getRetryAfterSeconds(resetAt: Date): string {
  const remainingSeconds = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
  return String(Math.max(1, remainingSeconds));
}

export async function POST(request: NextRequest) {
  console.log("🔥 ORIGINAL CHAT POST HANDLER EXECUTED");
  let stage = "request-start";

  try {
    stage = "csrf-validation";
    validateRequestOrigin(request);

    stage = "authentication";
    const auth = await requireAuth();

    stage = "request-body";
    const body = await request.json();
    const input = chatSchema.parse(body);

    stage = "chat-rate-limit";
    const rateLimit = await consumeChatRateLimit({
      organizationId: auth.organizationId,
      userId: auth.userId,
    });

    if (!rateLimit.allowed) {
      return Response.json(
        { error: "Too many chat requests" },
        {
          status: 429,
          headers: { "Retry-After": getRetryAfterSeconds(rateLimit.resetAt) },
        }
      );
    }

    stage = "abort-controller";
    const abortController = new AbortController();
    const handleRequestAbort = () => abortController.abort();
    request.signal.addEventListener("abort", handleRequestAbort, { once: true });

    const cleanupAbortListener = () => {
      request.signal.removeEventListener("abort", handleRequestAbort);
    };

    stage = "prepare-chat";
    const execution = await prepareChat({
      organizationId: toObjectId(auth.organizationId),
      userId: toObjectId(auth.userId),
      conversationId: input.conversationId,
      requestId: input.requestId,
      message: input.message,
      signal: abortController.signal,
    });

    stage = "create-sse-stream";
    const stream = createSSEStream({
      conversationId: String(execution.conversationId),
      assistantMessageId: String(execution.assistantMessageId),
      citations: execution.citations,
      stream: execution.stream,
      signal: abortController.signal,
      abortController,
      onCleanup: cleanupAbortListener,
    });

    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  } catch (error) {
    console.error("[CHAT API ERROR]", { stage, error });

    if (error instanceof Error && error.message === "CONVERSATION_NOT_FOUND") {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    return handleApiError(error);
  }
}
