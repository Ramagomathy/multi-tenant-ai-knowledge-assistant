import type { Types } from "mongoose";

export interface ReserveQuotaInput {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  requestId: string;
  estimatedTokens: number;
}

export interface QuotaSummary {
  monthlyLimitTokens: number;
  usedTokens: number;
  reservedTokens: number;
  remainingTokens: number;
  periodKey: string;
}