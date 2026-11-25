export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  generateEmbedding(text: string): Promise<number[]>;
}