// import "server-only";

export function cosineSimilarity(
  vectorA: number[],
  vectorB: number[]
): number {
  if (vectorA.length === 0 || vectorA.length !== vectorB.length) {
    throw new Error("Embedding dimensions do not match");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    const a = vectorA[i];
    const b = vectorB[i];

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new Error("Embedding contains invalid values");
    }

    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}