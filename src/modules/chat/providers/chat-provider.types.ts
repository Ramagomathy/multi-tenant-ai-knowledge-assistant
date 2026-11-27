export interface ChatGenerationInput {
  systemInstruction: string;
  input: string;
  signal?: AbortSignal;
}

export type ChatStreamEvent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };

export interface ChatProvider {
  generateStream(
    input: ChatGenerationInput
  ): AsyncGenerator<ChatStreamEvent>;
}