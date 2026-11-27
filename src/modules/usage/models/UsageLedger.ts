import mongoose, { Schema } from "mongoose";

const UsageLedgerSchema = new Schema(
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

    reservationId: {
      type: Schema.Types.ObjectId,
      ref: "QuotaReservation",
      required: true,
    },

    periodKey: {
      type: String,
      required: true,
    },

    eventType: {
      type: String,
      enum: ["settled", "cancelled"],
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
  },
  { timestamps: true }
);

UsageLedgerSchema.index(
  { reservationId: 1, eventType: 1 },
  { unique: true }
);

UsageLedgerSchema.index({
  organizationId: 1,
  periodKey: 1,
  createdAt: -1,
});

export default mongoose.models.UsageLedger ||
  mongoose.model("UsageLedger", UsageLedgerSchema);