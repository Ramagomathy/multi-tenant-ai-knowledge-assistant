
"use client";

import { MessageSquare, Plus, Send, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import AppShell from "@/components/app-shell";

type Citation = {
  documentName?: string;
  chunkId?: string;
  documentId?: string;
  [key: string]: unknown;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  function newConversation() {
    setConversationId(undefined);
    setMessages([]);
    setQuestion("");
    setError("");
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();

    const message = question.trim();
    if (!message || sending) return;

    setQuestion("");
    setError("");
    setSending(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      citations: [],
    };

    setMessages((current) => [
      ...current,
      userMessage,
      assistantMessage,
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId,
          requestId: crypto.randomUUID(),
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.message || "Chat request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const updateAssistant = (update: Partial<ChatMessage>) => {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessage.id
              ? { ...item, ...update }
              : item,
          ),
        );
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          let eventName = "message";
          let dataLine = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLine += line.slice(5).trim();
            }
          }

          if (!dataLine) continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataLine);
          } catch {
            continue;
          }

          if (eventName === "meta") {
            const id = payload.conversationId;
            if (typeof id === "string") setConversationId(id);
          }

          if (eventName === "token") {
            const token =
              typeof payload.text === "string"
                ? payload.text
                : typeof payload.token === "string"
                  ? payload.token
                  : "";

            if (token) {
              setMessages((current) =>
                current.map((item) =>
                  item.id === assistantMessage.id
                    ? { ...item, content: item.content + token }
                    : item,
                ),
              );
            }
          }

          if (eventName === "citations") {
            const citations = Array.isArray(payload.citations)
              ? (payload.citations as Citation[])
              : [];

            updateAssistant({ citations });
          }

          if (eventName === "final") {
            const finalText =
              typeof payload.text === "string" ? payload.text : "";

            if (finalText) updateAssistant({ content: finalText });
          }

          if (eventName === "error") {
            throw new Error(
              typeof payload.message === "string"
                ? payload.message
                : "The assistant encountered an error",
            );
          }
        }

        messagesRef.current?.scrollTo({
          top: messagesRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <h1>AI Assistant</h1>
          <p>Ask questions based on your organization's documents.</p>
        </div>
        <button className="button" onClick={newConversation}>
          <Plus size={17} /> New conversation
        </button>
      </div>

      <div className="chat-layout">
        <aside className="chat-sidebar">
          <h3>Knowledge Assistant</h3>
          <p className="muted">
            Answers are grounded in documents your organization has uploaded.
          </p>
          <div className="notice" style={{ background: "#f2edfb", color: "#62409b" }}>
            <Sparkles size={16} /> Use specific questions for better retrieval.
          </div>
        </aside>

        <section className="chat-main">
          <div className="chat-messages" ref={messagesRef}>
            {messages.length === 0 ? (
              <div className="empty-state">
                <MessageSquare size={34} />
                <h3>What would you like to know?</h3>
                <p>Ask a question about your uploaded documents.</p>
              </div>
            ) : (
              messages.map((item) => (
                <div
                  className={`chat-message ${
                    item.role === "user"
                      ? "chat-message-user"
                      : "chat-message-assistant"
                  }`}
                  key={item.id}
                >
                  {item.content || (sending ? "Thinking..." : "")}

                  {item.citations && item.citations.length > 0 && (
                    <div className="citation-list">
                      <strong>Sources</strong>
                      {item.citations.map((citation, index) => (
                        <div key={`${citation.chunkId ?? "source"}-${index}`}>
                          {citation.documentName || "Referenced document"}
                          {citation.chunkId
                            ? ` · Chunk ${citation.chunkId}`
                            : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {error && <div className="notice notice-error">{error}</div>}

          <form className="chat-composer" onSubmit={sendMessage}>
            <textarea
              className="chat-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask something about your documents..."
              rows={1}
              maxLength={4000}
              disabled={sending}
            />
            <button
              className="button button-primary"
              type="submit"
              disabled={sending || !question.trim()}
              aria-label="Send message"
            >
              <Send size={17} />
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
