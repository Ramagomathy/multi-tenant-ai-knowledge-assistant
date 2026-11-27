// import "server-only";

import type { Types } from "mongoose";

import { normalizeQuery } from "./query-normalization.service";
import { retrieveHybrid } from "./hybrid-retrieval.service";

import type { RetrievalResult } from "../types/retrieval.types";

export async function retrieveDocuments(params: {
  organizationId: Types.ObjectId;
  query: string;
  topK: number;
}): Promise<RetrievalResult> {
  const query = normalizeQuery(params.query);

  if (query.length < 3) {
    throw new Error("Query must contain at least 3 meaningful characters");
  }

  const results = await retrieveHybrid({
    organizationId: params.organizationId,
    query,
    topK: params.topK,
  });

  return {
    query,
    results,
    totalResults: results.length,
  };
}