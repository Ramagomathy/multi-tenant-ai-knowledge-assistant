// import "server-only";

import { createHash } from "crypto";
import { Types } from "mongoose";

import Organization from "@/modules/organizations/models/Organization";

import AnswerCache from "../models/AnswerCache";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function createCacheKey(question: string) {
  const normalized = question
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return createHash("sha256")
    .update(normalized)
    .digest("hex");
}

export async function getCachedAnswer(params: {
  organizationId: Types.ObjectId;
  question: string;
}) {
  const organization = await Organization.findById(
    params.organizationId
  )
    .select("knowledgeVersion")
    .lean();

  if (!organization) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }

  const cacheKey = createCacheKey(params.question);

  return AnswerCache.findOne({
    organizationId: params.organizationId,
    knowledgeVersion: organization.knowledgeVersion ?? 0,
    cacheKey,
    expiresAt: { $gt: new Date() },
  }).lean();
}

export async function saveCachedAnswer(params: {
  organizationId: Types.ObjectId;
  question: string;
  answer: string;
  citations: unknown[];
  model: string;
}) {
  const organization = await Organization.findById(
    params.organizationId
  )
    .select("knowledgeVersion")
    .lean();

  if (!organization) return;

  const cacheKey = createCacheKey(params.question);

  await AnswerCache.updateOne(
    {
      organizationId: params.organizationId,
      knowledgeVersion: organization.knowledgeVersion ?? 0,
      cacheKey,
    },
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