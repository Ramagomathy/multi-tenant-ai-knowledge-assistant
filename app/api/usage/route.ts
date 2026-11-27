import { NextResponse } from "next/server";

import { requireAuth } from "@/modules/auth/utils/auth";
import { handleApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/mongodb/object-id";

import { getQuotaSummary } from "@/modules/usage/services/quota.service";

export function getUsagePercentage(params: {
  usedTokens: number;
  monthlyLimitTokens: number;
}): number {
  if (params.monthlyLimitTokens <= 0) return 0;
  return Math.min(100, Math.round((params.usedTokens / params.monthlyLimitTokens) * 100));
}

export async function GET() {
  try {
    const auth = await requireAuth();
    const usage = await getQuotaSummary(toObjectId(auth.organizationId));

    return NextResponse.json({ success: true, data: usage });
  } catch (error) {
    return handleApiError(error);
  }
}
