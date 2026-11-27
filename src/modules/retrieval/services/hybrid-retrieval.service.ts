// import "server-only";

import type { Types } from "mongoose";
import type { RetrievalCandidate } from "../types/retrieval.types";

import { retrieveByVector } from "./vector-retrieval.service";
import { retrieveByKeyword } from "./keyword-retrieval.service";

const RRF_K = 60;

export async function retrieveHybrid(params: {
  organizationId: Types.ObjectId;
  query: string;
  topK: number;
}): Promise<RetrievalCandidate[]> {
  const candidateCount = Math.min(params.topK * 3, 30);

  const [vectorResults, keywordResults] = await Promise.all([
    retrieveByVector({
      ...params,
      topK: candidateCount,
    }),
    retrieveByKeyword({
      ...params,
      topK: candidateCount,
    }),
  ]);

  const combined = new Map<
    string,
    {
      result: RetrievalCandidate;
      rrfScore: number;
    }
  >();

  function addResults(
    results: RetrievalCandidate[],
    source: "vector" | "keyword"
  ) {
    results.forEach((result, index) => {
      const id = String(result.chunkId);
      const contribution = 1 / (RRF_K + index + 1);

      const existing = combined.get(id);

      if (existing) {
        existing.rrfScore += contribution;

        if (source === "vector") {
          existing.result.vectorScore = result.vectorScore;
        } else {
          existing.result.keywordScore = result.keywordScore;
        }
      } else {
        combined.set(id, {
          result: { ...result },
          rrfScore: contribution,
        });
      }
    });
  }

  addResults(vectorResults, "vector");
  addResults(keywordResults, "keyword");

  return Array.from(combined.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, params.topK)
    .map(({ result, rrfScore }) => ({
      ...result,
      score: rrfScore,
    }));
}