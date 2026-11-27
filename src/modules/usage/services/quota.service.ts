// import "server-only";

import { Types } from "mongoose";

import Organization from "@/modules/organizations/models/Organization";

import OrganizationQuota from "../models/OrganizationQuota";
import QuotaReservation from "../models/QuotaReservation";
import UsageLedger from "../models/UsageLedger";

import type {
  ReserveQuotaInput,
  QuotaSummary,
} from "../types/usage.types";

const RESERVATION_TTL_MS = 10 * 60 * 1000;

function getCurrentPeriodKey(): string {
  const now = new Date();

  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
}

export async function releaseExpiredReservations(
  organizationId?: Types.ObjectId
) {
  const expired = await QuotaReservation.find({
    status: "reserved",
    expiresAt: { $lte: new Date() },
    ...(organizationId ? { organizationId } : {}),
  })
    .sort({ expiresAt: 1 })
    .limit(100)
    .select("_id organizationId userId");

  let released = 0;

  for (const reservation of expired) {
    try {
      await cancelQuota({
        reservationId: reservation._id,
        organizationId: reservation.organizationId,
        userId: reservation.userId,
      });

      released++;
    } catch {
      // Another request may have settled or cancelled it.
      // The next recovery pass will inspect it again.
    }
  }

  return released;
}

async function ensureQuotaPeriod(
  organizationId: Types.ObjectId,
  periodKey: string
) {
  const organization = await Organization.findById(organizationId)
    .select("monthlyTokenLimit")
    .lean();

  if (!organization) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }

  try {
    await OrganizationQuota.updateOne(
      { organizationId, periodKey },
      {
        $setOnInsert: {
          monthlyLimitTokens: organization.monthlyTokenLimit ?? 100000,
          usedTokens: 0,
          reservedTokens: 0,
        },
      },
      { upsert: true }
    );
  } catch (error: any) {
    // Another concurrent request may have initialized this period.
    if (error?.code !== 11000) throw error;
  }
}

export async function reserveQuota(
  input: ReserveQuotaInput
) {
  if (
    !Number.isInteger(input.estimatedTokens) ||
    input.estimatedTokens <= 0 ||
    input.estimatedTokens > 100000
  ) {
    throw new Error("INVALID_TOKEN_RESERVATION");
  }


  const existing = await QuotaReservation.findOne({
    organizationId: input.organizationId,
    requestId: input.requestId,
  });

  if (existing) {
  if (String(existing.userId) !== String(input.userId)) {
    throw new Error("IDEMPOTENCY_CONFLICT");
  }

  if (existing.status === "reserved") {
    throw new Error("REQUEST_ALREADY_IN_PROGRESS");
  }

  if (existing.status === "settled") {
    throw new Error("REQUEST_ALREADY_COMPLETED");
  }

  throw new Error("REQUEST_ALREADY_CANCELLED");
}

  const periodKey = getCurrentPeriodKey();

  await ensureQuotaPeriod(input.organizationId, periodKey);

  const quota = await OrganizationQuota.findOneAndUpdate(
    {
      organizationId: input.organizationId,
      periodKey,
      $expr: {
        $lte: [
          {
            $add: [
              "$usedTokens",
              "$reservedTokens",
              input.estimatedTokens,
            ],
          },
          "$monthlyLimitTokens",
        ],
      },
    },
    {
      $inc: {
        reservedTokens: input.estimatedTokens,
      },
    },
    { new: true }
  );

  if (!quota) {
    throw new Error("QUOTA_EXCEEDED");
  }

  try {
    await releaseExpiredReservations(input.organizationId);
    return await QuotaReservation.create({
      organizationId: input.organizationId,
      userId: input.userId,
      periodKey,
      requestId: input.requestId,
      estimatedTokens: input.estimatedTokens,
      actualTokens: 0,
      status: "reserved",
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
    });
  } catch (error: any) {
    // Release the quota if reservation creation failed.
    await OrganizationQuota.updateOne(
      { _id: quota._id },
      { $inc: { reservedTokens: -input.estimatedTokens } }
    );

    if (error?.code === 11000) {
      const duplicate = await QuotaReservation.findOne({
        organizationId: input.organizationId,
        requestId: input.requestId,
      });

      if (duplicate && String(duplicate.userId) === String(input.userId)) {
        return duplicate;
      }
    }

    throw error;
  }
}

export async function settleQuota(params: {
  reservationId: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  actualTokens: number;
}) {
  if (
    !Number.isInteger(params.actualTokens) ||
    params.actualTokens < 0 ||
    params.actualTokens > 100000
  ) {
    throw new Error("INVALID_ACTUAL_USAGE");
  }

  const reservation = await QuotaReservation.findOne({
    _id: params.reservationId,
    organizationId: params.organizationId,
    userId: params.userId,
  });

  if (!reservation) {
    throw new Error("RESERVATION_NOT_FOUND");
  }

  if (reservation.status === "settled") {
    if (reservation.actualTokens !== params.actualTokens) {
      throw new Error("SETTLEMENT_CONFLICT");
    }

    return reservation;
  }

  if (reservation.status !== "reserved") {
    throw new Error("RESERVATION_NOT_ACTIVE");
  }

  const session = await QuotaReservation.startSession();

  try {
    await session.withTransaction(async () => {
      const updatedReservation =
        await QuotaReservation.findOneAndUpdate(
          {
            _id: reservation._id,
            organizationId: params.organizationId,
            userId: params.userId,
            status: "reserved",
          },
          {
            $set: {
              status: "settled",
              actualTokens: params.actualTokens,
              settledAt: new Date(),
            },
          },
          { new: true, session }
        );

      if (!updatedReservation) {
        throw new Error("RESERVATION_ALREADY_PROCESSED");
      }

      const quotaUpdate = await OrganizationQuota.updateOne(
        {
          organizationId: params.organizationId,
          periodKey: reservation.periodKey,
          reservedTokens: { $gte: reservation.estimatedTokens },
        },
        {
          $inc: {
            reservedTokens: -reservation.estimatedTokens,
            usedTokens: params.actualTokens,
          },
        },
        { session }
      );

      if (quotaUpdate.modifiedCount !== 1) {
        throw new Error("QUOTA_SETTLEMENT_FAILED");
      }

      await UsageLedger.create(
        [
          {
            organizationId: params.organizationId,
            userId: params.userId,
            reservationId: reservation._id,
            periodKey: reservation.periodKey,
            eventType: "settled",
            estimatedTokens: reservation.estimatedTokens,
            actualTokens: params.actualTokens,
          },
        ],
        { session }
      );
    });

    return QuotaReservation.findById(reservation._id);
  } finally {
    await session.endSession();
  }
}

export async function cancelQuota(params: {
  reservationId: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
}) {
  const reservation = await QuotaReservation.findOne({
    _id: params.reservationId,
    organizationId: params.organizationId,
    userId: params.userId,
  });

  if (!reservation) {
    throw new Error("RESERVATION_NOT_FOUND");
  }

  if (reservation.status === "cancelled") return reservation;

  if (reservation.status === "settled") {
    throw new Error("SETTLED_RESERVATION_CANNOT_BE_CANCELLED");
  }

  const session = await QuotaReservation.startSession();

  try {
    await session.withTransaction(async () => {
      const updated = await QuotaReservation.findOneAndUpdate(
        {
          _id: reservation._id,
          status: "reserved",
        },
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
          },
        },
        { new: true, session }
      );

      if (!updated) {
        throw new Error("RESERVATION_ALREADY_PROCESSED");
      }

      const result = await OrganizationQuota.updateOne(
        {
          organizationId: params.organizationId,
          periodKey: reservation.periodKey,
          reservedTokens: { $gte: reservation.estimatedTokens },
        },
        {
          $inc: {
            reservedTokens: -reservation.estimatedTokens,
          },
        },
        { session }
      );

      if (result.modifiedCount !== 1) {
        throw new Error("QUOTA_RELEASE_FAILED");
      }

      await UsageLedger.create(
        [
          {
            organizationId: params.organizationId,
            userId: params.userId,
            reservationId: reservation._id,
            periodKey: reservation.periodKey,
            eventType: "cancelled",
            estimatedTokens: reservation.estimatedTokens,
            actualTokens: 0,
          },
        ],
        { session }
      );
    });

    return QuotaReservation.findById(reservation._id);
  } finally {
    await session.endSession();
  }
}

export async function getQuotaSummary(
  organizationId: Types.ObjectId
): Promise<QuotaSummary> {
  await releaseExpiredReservations(organizationId);
  const periodKey = getCurrentPeriodKey();

  await ensureQuotaPeriod(organizationId, periodKey);

  const quota = await OrganizationQuota.findOne({
    organizationId,
    periodKey,
  }).lean();

  if (!quota) {
    throw new Error("QUOTA_NOT_FOUND");
  }

  return {
    monthlyLimitTokens: quota.monthlyLimitTokens,
    usedTokens: quota.usedTokens,
    reservedTokens: quota.reservedTokens,
    remainingTokens: Math.max(
      0,
      quota.monthlyLimitTokens -
        quota.usedTokens -
        quota.reservedTokens
    ),
    periodKey,
  };
}