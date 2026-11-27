// import "server-only";

export interface TextChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
}

const TARGET_CHARS = 2000;
const OVERLAP_CHARS = 320;
const MIN_CHUNK_CHARS = 100;

function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];

  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();

    if (!trimmed) continue;

    if (trimmed.length > TARGET_CHARS) {
      if (current) parts.push(current);

      for (let i = 0; i < trimmed.length; i += TARGET_CHARS) {
        parts.push(trimmed.slice(i, i + TARGET_CHARS));
      }

      current = "";
      continue;
    }

    if ((current + " " + trimmed).length > TARGET_CHARS) {
      if (current) parts.push(current);
      current = trimmed;
    } else {
      current = current ? `${current} ${trimmed}` : trimmed;
    }
  }

  if (current) parts.push(current);

  return parts;
}

export function chunkText(text: string): TextChunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const segments: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length > TARGET_CHARS) {
      segments.push(...splitLongParagraph(paragraph));
    } else {
      segments.push(paragraph);
    }
  }

  const chunks: TextChunk[] = [];
  let current = "";

  for (const segment of segments) {
    const combined = current
      ? `${current}\n\n${segment}`
      : segment;

    if (combined.length > TARGET_CHARS && current) {
      chunks.push({
        chunkIndex: chunks.length,
        content: current.trim(),
        tokenCount: Math.ceil(current.length / 4),
      });

      const overlap = current.slice(-OVERLAP_CHARS);
      current = `${overlap}\n\n${segment}`;
    } else {
      current = combined;
    }
  }

  if (current.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push({
      chunkIndex: chunks.length,
      content: current.trim(),
      tokenCount: Math.ceil(current.length / 4),
    });
  }

  return chunks;
}