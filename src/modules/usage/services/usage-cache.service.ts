// import "server-only";

import { createHash } from "crypto";
import { Types } from "mongoose";

import Organization from "@/modules/organizations/models/Organization";
import AnswerCache from "../models/AnswerCache";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedCitation = {
  citationId: string;
  documentId: Types.ObjectId;
  chunkId: Types.ObjectId;
  documentName: string;
  chunkIndex: number;
};
export type CachedAnswer = { answer: string; citations: CachedCitation[] };

function createCacheKey(question: string) {
  const normalized = question.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

async function getKnowledgeVersion(organizationId: Types.ObjectId): Promise<number> {
  const organization = (await Organization.findById(organizationId)
    .select("knowledgeVersion")
    .lean()) as { knowledgeVersion?: number } | null;

  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  return organization.knowledgeVersion ?? 0;
}

export async function getCachedAnswer(params: {
  organizationId: Types.ObjectId;
  question: string;
}): Promise<CachedAnswer | null> {
  const knowledgeVersion = await getKnowledgeVersion(params.organizationId);
  const cacheKey = createCacheKey(params.question);
  const cached = (await AnswerCache.findOne({
    organizationId: params.organizationId,
    knowledgeVersion,
    cacheKey,
    expiresAt: { $gt: new Date() },
  }).lean()) as CachedAnswer | null;
  return cached;
}

export async function saveCachedAnswer(params: {
  organizationId: Types.ObjectId;
  question: string;
  answer: string;
  citations: unknown[];
  model: string;
}) {
  let knowledgeVersion: number;
  try {
    knowledgeVersion = await getKnowledgeVersion(params.organizationId);
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_NOT_FOUND") return;
    throw error;
  }

  const cacheKey = createCacheKey(params.question);
  await AnswerCache.updateOne(
    { organizationId: params.organizationId, knowledgeVersion, cacheKey },
    {
      $set: {
        question: params.question,
        answer: params.answer,
        citations: params.citations,
        model: params.model,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
    },
    { upsert: true }
  );
}
