export interface StreamChatOptions {
  conversationId?: string;
  requestId: string;
  message: string;
  onToken: (text: string) => void;
  onCitations?: (citations: unknown[]) => void;
  onComplete?: () => void;
  onError?: (message: string) => void;
  onFinal?: (text: string) => void;
  signal?: AbortSignal;
}

export async function streamChat(options: StreamChatOptions) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
  conversationId: options.conversationId,
  requestId: options.requestId,
  message: options.message,
}),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));

    throw new Error(body.error || "Chat request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const eventBlock of events) {
        const lines = eventBlock.split(/\r?\n/);

        const eventName = lines
          .find((line) => line.startsWith("event:"))
          ?.slice(6)
          .trim();

        const dataLine = lines
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
          .trim();

        if (!eventName || !dataLine) continue;

        const data = JSON.parse(dataLine);

        switch (eventName) {
          case "token":
            options.onToken(data.text);
            break;

          case "citations":
            options.onCitations?.(data.citations);
            break;

          case "done":
            options.onComplete?.();
            break;

          case "error":
            options.onError?.(data.message);
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}