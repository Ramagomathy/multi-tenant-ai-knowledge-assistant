import mongoose, { Schema } from "mongoose";

const QuotaReservationSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    periodKey: {
      type: String,
      required: true,
    },

    requestId: {
      type: String,
      required: true,
    },

    estimatedTokens: {
      type: Number,
      required: true,
    },

    actualTokens: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["reserved", "settled", "cancelled"],
      default: "reserved",
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    settledAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }
);

QuotaReservationSchema.index(
  { organizationId: 1, requestId: 1 },
  { unique: true, name: "uniq_org_request_reservation" }
);

QuotaReservationSchema.index({
  status: 1,
  expiresAt: 1,
});

export default mongoose.models.QuotaReservation ||
  mongoose.model("QuotaReservation", QuotaReservationSchema);